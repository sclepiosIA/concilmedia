
# Piste #1 — RLHF après conciliation par pharmacien

## Contexte

La table `conciliation_validations` capture déjà les décisions du pharmacien (`item_decisions` JSONB : accepted / rejected / modified, avec `overrides` et `comment`). C'est une base RLHF implicite, mais inexploitable en l'état : pas d'extraction, pas de métriques, pas de boucle vers les prompts.

Cette piste rend ce signal exploitable de bout en bout, **sans toucher au flux clinique existant**.

## Objectif

Transformer chaque validation pharmacien en **paire (input LLM → décision humaine)** exploitable pour :
1. Mesurer la qualité des modèles (taux d'acceptation par catégorie, par modèle, par sévérité).
2. Identifier les patterns d'erreur récurrents (rejets fréquents, corrections systématiques).
3. Construire un dataset d'évaluation et de fine-tuning (export JSONL).
4. Injecter automatiquement les corrections fréquentes dans les prompts (few-shot dynamique).

## Périmètre (ce qui sera fait)

### 1. Schéma — table dédiée aux signaux RLHF
Nouvelle migration `ai_feedback_signals` (séparée de `conciliation_validations` pour rester append-only et analytique) :

```text
ai_feedback_signals
├── id uuid pk
├── analysis_id uuid  → conciliation_ai_analyses
├── validation_id uuid → conciliation_validations
├── patient_id uuid
├── model text              (ex: google/gemini-3-flash-preview)
├── task_slug text          (ex: analyze)
├── category text           (interactions, contre_indications, …, alertes_regles)
├── item_index int
├── decision text           (accepted | rejected | modified)
├── severity_original text
├── severity_corrected text
├── had_override boolean
├── comment text
├── llm_payload jsonb       (snapshot de l'item original LLM)
├── human_payload jsonb     (item après overrides du pharmacien)
├── pharmacien_id uuid
├── created_at timestamptz
```

- GRANT pour `authenticated` + `service_role`, RLS : lecture limitée à l'organisation, insert via serverFn uniquement.
- Index sur `(model, task_slug, category, decision)`.

### 2. ServerFn — `recordFeedbackSignals`
- Déclenchée automatiquement par `saveConciliationValidation` (en fin de handler, après upsert).
- Pour chaque item du payload LLM : lit la décision correspondante dans `item_decisions`, snapshote `llm_payload` et `human_payload`, insère une ligne dans `ai_feedback_signals`.
- Idempotent : supprime puis réinsère les signaux liés à `validation_id` (le pharmacien peut re-valider).

### 3. ServerFn — `getFeedbackMetrics`
- Renvoie agrégats : taux d'acceptation / rejet / modification par `(model, category)`, top 20 items rejetés (groupés par `llm_payload.medicaments` ou DCI), évolution temporelle.

### 4. Page UI — `/admin/ai/rlhf`
- Onglet ajouté dans `/admin/ai`.
- Composants :
  - Cards : volume de signaux, taux d'acceptation global, taux par modèle.
  - Tableau : taux d'acceptation par catégorie × modèle.
  - Tableau "Top patterns rejetés" : item LLM + nombre d'occurrences + raisons fréquentes.
  - Bouton **Exporter le dataset** (JSONL téléchargeable, format prompt/completion adapté à un fine-tuning).

### 5. Boucle prompt — few-shot dynamique
- Dans `resolveAITask`, option `useFeedbackExemplars: true` sur la tâche `analyze` :
  - Charge les 3–5 corrections les plus fréquentes pour `analyze` (rejets ou modifications validés ≥ N fois).
  - Les concatène au `systemPrompt` sous forme d'exemples « ❌ Évite ce type d'alerte / ✅ Préfère cette formulation ».
- Activable / désactivable depuis `/admin/ai/tasks/analyze` (champ déjà existant côté UI à étendre).

### 6. Export dataset
- ServerFn `exportFeedbackDataset` → renvoie un JSONL téléchargeable :
  ```text
  {"context": {patient_snapshot}, "llm_output": {...}, "human_decision": "rejected", "human_correction": {...}}
  ```
- Filtres : période, modèle, catégorie, statut.

## Hors périmètre

- Pas de fine-tuning effectif d'un modèle (uniquement export du dataset prêt à l'emploi).
- Pas de re-scoring rétroactif des analyses existantes.
- Pas de PPO / DPO en ligne — seulement la collecte et la boucle few-shot.

## Fichiers touchés

- **Migration SQL** : création `ai_feedback_signals` + GRANT + RLS + index.
- **Nouveau** : `src/lib/ai/feedbackSignals.functions.ts` (`recordFeedbackSignals`, `getFeedbackMetrics`, `exportFeedbackDataset`).
- **Modifié** : `src/lib/conciliation/validateConciliation.functions.ts` (appel `recordFeedbackSignals` en fin de handler).
- **Modifié** : `src/lib/ai/runAITask.server.ts` (chargement few-shot exemplars si activé).
- **Nouveau** : `src/routes/_authenticated/admin.ai.rlhf.tsx` (tableau de bord + export).
- **Modifié** : `src/routes/_authenticated/admin.ai.tsx` (lien onglet RLHF).
- **Modifié** : `src/routes/_authenticated/ameliorations.tsx` (badge « En cours » sur la piste #1).

## Vérification

- Valider une conciliation existante → vérifier l'apparition de lignes dans `ai_feedback_signals`.
- Ouvrir `/admin/ai/rlhf` → métriques affichées, export JSONL fonctionnel.
- Activer le few-shot sur `analyze` → relancer une analyse, vérifier la présence des exemplars dans les logs `ai_task_executions`.

