## Diagnostic actuel

Le schéma `ai_tasks.execution_mode` supporte déjà `llm | ml | both`, et **2 endpoints** sont marqués `ml` :

- `ml_prioritize_patient` (Étage 2 — priorisation patient)
- `ml_omission_severity` (Étage 4 — gravité d'un oubli)

Côté serveur, `prioritize.functions.ts` et `analyze.functions.ts` lancent déjà LLM + ML en parallèle quand le mode est `both`, persistent les 2 scores (`risk_scores.source = 'llm' | 'ml'`) et retournent `{ mode, ml, ml_error }`.

**Mais** :
- Le provider `ML ConcilMed` est `is_active = false` → aucun appel ML ne part réellement.
- Aucune UI ne montre, par endpoint, quel mode est actif ni les 2 réponses côte-à-côte.
- Les 10 autres endpoints sont en `llm` pur (normal : pas de jumeau ML).
- Les system_prompts et paramètres ne sont pas persistés (lié au plan précédent).

## Plan

### 1. Activer et configurer le provider ML interne
- Migration : `UPDATE ai_providers SET is_active = true WHERE name = 'ML ConcilMed'` + valeurs par défaut de seuils (déjà présentes : `layer2_threshold`, `layer4_threshold`).
- Vérifier que `mlConcilmed.server.ts` lit bien `base_url` / `extra_config` et expose `mlIsConfigured()` correctement ; sinon ajouter une variable d'env optionnelle `ML_CONCILMED_BASE_URL`.
- Ajouter un champ `health_status` calculé (ping) dans `getProviders` pour l'afficher dans l'admin.

### 2. Admin AI — onglet d'un endpoint
Dans `src/routes/_authenticated/admin.ai.tasks.$slug.tsx` :
- **Bandeau "Moteur d'exécution"** affichant l'`execution_mode` courant :
  - `llm` → badge bleu "LLM uniquement"
  - `ml`  → badge violet "ML interne uniquement"
  - `both`→ badge dégradé "LLM + ML (comparaison)"
- Sélecteur `execution_mode` (déjà supporté côté schéma `getTask`) — **désactivé** pour les 10 endpoints qui n'ont pas de jumeau ML (whitelist côté code : seuls `ml_prioritize_patient` et `ml_omission_severity` peuvent passer en `ml`/`both`).
- Si `execution_mode ∈ {ml, both}` : afficher un sous-bloc "Paramètres ML" lisant/écrivant `extra_config.ml` (seuil, version de modèle attendue, timeout) en plus du bloc LLM.
- État du provider ML (actif / inactif / unreachable) affiché en clair, avec lien vers l'écran providers.

### 3. Affichage parallèle des 2 réponses
Là où le résultat est rendu (prioritisation patient + analyse complète) :
- Composant `<LlmVsMlPanel />` qui prend `{ llm: {...}, ml: {...} | null, ml_error?: string, mode }` et :
  - en `llm` → une seule colonne ;
  - en `ml`  → une seule colonne (badge "ML") ;
  - en `both`→ 2 colonnes côte-à-côte avec score, niveau, écart Δ et temps d'exécution.
- Branché dans :
  - `CohortResultsTab.tsx` (colonne supplémentaire `ml_score` / différence) ;
  - la fiche patient (résultat de `computePrioritization` + `analyzePatientConciliationComplete`).
- La table `risk_scores` contient déjà `source` → on lit les 2 dernières lignes par épisode pour comparer.

### 4. Cohorte multi-modèles
`runCohortMultiModel.functions.ts` boucle actuellement sur des modèles LLM ; ajouter le pseudo-modèle `internal-ml` (clé `internal-ml-concilmed`) dans `availableModels.ts`, traité spécialement : pas d'appel SDK, appel direct à `predictLayer2` / `predictLayer4`. Cela permettra de comparer `gpt-5.4` vs `claude-opus-4.8` vs `internal-ml` dans le même tableau de résultats.

### 5. Vérification
- Test manuel : passer `ml_prioritize_patient` en `both`, lancer la priorisation sur 1 patient → `risk_scores` doit contenir 2 lignes (`source = 'llm'` et `'ml'`) et l'UI doit afficher les 2 scores.
- Cohorte : lancer sur 3 patients avec `[gpt-5.4, internal-ml]` cochés → tableau avec 6 résultats (2 modèles × 3 patients).

## Détails techniques

| Fichier | Modification |
|---|---|
| `supabase/migrations/<ts>_activate_ml_provider.sql` | activer `ML ConcilMed`, défaut seuils si `NULL` |
| `src/lib/admin/ai.functions.ts` | retourner `execution_mode` + `ml_provider_status` + `extra_config.ml` |
| `src/routes/_authenticated/admin.ai.tasks.$slug.tsx` | bandeau mode + sélecteur + bloc ML conditionnel |
| `src/components/conciliation/LlmVsMlPanel.tsx` (nouveau) | rendu 1 ou 2 colonnes |
| `src/components/cohort/CohortResultsTab.tsx` | colonnes ML + Δ |
| `src/lib/ai/availableModels.ts` | ajouter entrée `internal-ml-concilmed` |
| `src/lib/cohort/runCohortMultiModel.functions.ts` | brancher la branche ML |
| (pas de modif) `prioritize.functions.ts`, `analyze.functions.ts`, `mlConcilmed.server.ts` | déjà OK |

Aucune nouvelle table. Aucun secret nouveau (l'URL du service ML interne sera ajoutée à `ai_providers.base_url` via l'admin).
