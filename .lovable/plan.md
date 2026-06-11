## Piste #15 — Évaluation continue des modèles LLM (v1)

Objectif : un banc d'essai reproductible qui rejoue un jeu de cas annotés (golden set) sur chaque combinaison `(ai_task, provider, model)`, calcule des métriques de qualité / latence / coût, archive les runs et alerte sur les régressions, le tout accessible depuis l'admin.

### Périmètre v1
- Tâches IA évaluées en priorité (déjà routées via `runAITask`) :
  - `reconciliation_analysis` (DNI, omissions, transferts)
  - `bmo_synthesis` (synthèse patient)
  - `liaison_letter` (lettre de liaison)
- Sources de golden set réutilisées (pas de nouvelle UI d'annotation v1) :
  - `ground_truth_dnis` → vérité terrain DNI
  - `pharmacist_gold_standards` → BMO/lettre validées
- Lancement : manuel depuis admin + cron quotidien optionnel (out of v1, seulement bouton + endpoint préparé).

### Lots

**Lot A — Schéma & migrations**
- Nouvelles tables (publiques, RLS admin-only, GRANT authenticated/service_role) :
  - `eval_datasets(id, slug unique, task_slug, description, item_count, created_at)`
  - `eval_dataset_items(id, dataset_id, ref_type, ref_id, input jsonb, expected jsonb, weight, created_at)` — `ref_type` ∈ {`ground_truth_dni`, `pharmacist_gold_standard`, `manual`}
  - `eval_runs(id, dataset_id, task_slug, provider_id, model, status, started_at, finished_at, n_items, n_ok, n_fail, metrics jsonb, cost_eur, total_tokens, triggered_by, created_at)`
  - `eval_run_items(id, run_id, dataset_item_id, output jsonb, score jsonb, latency_ms, tokens_in, tokens_out, cost_eur, error text, created_at)`
- Index : `eval_runs(task_slug, model, started_at desc)`, `eval_run_items(run_id)`.
- RLS : SELECT/INSERT réservés `has_role(auth.uid(),'admin')` ; service_role full.

**Lot B — Métriques (`src/lib/eval/metrics.ts`)**
- Helpers purs et testables :
  - `scoreDniSet(expected, output)` → précision / rappel / F1 sur l'ensemble des DNI normalisés (clé `{atc|name}+severity`).
  - `scoreBmo(expected, output)` → exactitude par champ (nb médocs match, posologie, voie) + F1 sur la liste finale.
  - `scoreLetter(expected, output)` → ROUGE-L simplifié (LCS) + couverture des items clés via tags.
- Sortie standard : `{ score: 0..1, breakdown: Record<string,number>, notes?: string[] }`.

**Lot C — Constitution du dataset (`src/lib/eval/dataset.functions.ts`)**
- `buildDatasetFromGroundTruth({ taskSlug, limit })` : agrège `ground_truth_dnis` (DNI) ou `pharmacist_gold_standards` (BMO/lettre) → upsert `eval_datasets` + `eval_dataset_items`. Idempotent par `(ref_type, ref_id)`.
- `listDatasets()`, `getDataset(id)` (admin).

**Lot D — Exécution du banc (`src/lib/eval/runner.functions.ts`)**
- `runEvaluation({ datasetId, models: [{providerId, model}], maxConcurrency=2 })` :
  1. Crée `eval_runs` (status=running).
  2. Pour chaque item × modèle : appelle `runAITask` (mode déterministe : `temperature=0`, seed si dispo) avec l'input du dataset, mesure latence, capture tokens et coût (depuis la réponse provider, sinon estimation via prix `available_models`).
  3. Calcule score via Lot B → insert `eval_run_items`.
  4. Agrège `metrics` (F1 moyen pondéré, p50/p95 latence, coût total, taux d'échec), met à jour `eval_runs`.
- Logue chaque run dans `audit_log` via `audit('EVAL_RUN_EXECUTE', 'eval_run', runId, { taskSlug, model })`.
- Garde-fou : annule si > N minutes, marque `status='failed'`.

**Lot E — Détection de régression**
- `compareToBaseline(runId)` server fn : prend le dernier run "baseline" (même task, même dataset, modèle précédent du même provider OU run le plus récent), retourne `delta` par métrique + flag `regression` si F1 chute > 5 pts ou latence p95 > +30 %.
- Pas d'alerting externe v1 : badge rouge dans l'UI + entrée `audit_log` `EVAL_REGRESSION_DETECTED`.

**Lot F — UI admin (`/admin/ai/eval`)**
- Nouvelle route `src/routes/_authenticated/admin.ai.eval.tsx` + lien depuis `admin.ai.index.tsx`.
- Sections :
  1. **Datasets** : liste + bouton "Reconstruire depuis ground truth" par task.
  2. **Lancer un run** : sélecteur dataset + matrice modèles (issue de `ai_providers` × `available_models`) + bouton exécuter.
  3. **Historique** : table runs (task, modèle, F1, p95, coût, statut, date) avec filtre task/modèle.
  4. **Détail run** : métriques globales, top items en échec (input/expected/output diff), comparaison baseline.
- Accès gated par `useIsAdmin` (déjà utilisé pour `EntityAuditPanel`).

**Lot G — Mise à jour pistes**
- `ameliorations.tsx` : piste #15 → statut "Livré v1", note "v2 = annotation in-app + cron nocturne + alerte email/Slack sur régression".

### Détails techniques
- Tous les serverFn passent par `requireSupabaseAuth` + check `has_role('admin')`.
- Coût : si provider ne renvoie pas le coût, estimation `(tokens_in*prixIn + tokens_out*prixOut)/1M` depuis `availableModels.ts` (compléter le mapping si manquant).
- Concurrence : `Promise.all` par batch de `maxConcurrency` ; on borne à 5 modèles × 20 items par appel UI pour rester < 60 s ; au-delà, prévenir l'utilisateur et reco cron.
- Déterminisme : `temperature=0`, JSON schema déjà imposé par `runAITask`.
- Aucun PII supplémentaire stocké : les inputs golden sont déjà anonymisés (ground truth / gold standards).
- Audit actions à ajouter dans `src/lib/audit/actions.ts` : `EVAL_DATASET_BUILD`, `EVAL_RUN_EXECUTE`, `EVAL_REGRESSION_DETECTED`.

### Hors périmètre v1
- UI d'annotation manuelle de nouveaux cas (réutilise existant).
- Cron nocturne automatique (préparer le serverFn, ne pas planifier).
- Alerting email/Slack.
- A/B testing en production (shadow mode).
- Comparaison multi-provider sur prompts versionnés (v2 via `ai_prompt_versions`).

### Critères d'acceptation
- Un admin peut, depuis `/admin/ai/eval`, construire un dataset DNI à partir de `ground_truth_dnis`, lancer un run sur 2 modèles, voir F1/latence/coût, et identifier les items en régression.
- Toute exécution apparaît dans `audit_log` ≤ 2 s.
- Les non-admins n'ont aucun accès (route + serverFn).
- Build et lints passent ; aucune modification de `runAITask` au-delà de l'ajout d'un mode `dryRun=false` déterministe si nécessaire.

### Fichiers prévus
- **Créés** : migration SQL, `src/lib/eval/metrics.ts`, `src/lib/eval/dataset.functions.ts`, `src/lib/eval/runner.functions.ts`, `src/lib/eval/baseline.functions.ts`, `src/routes/_authenticated/admin.ai.eval.tsx`, `src/components/admin/eval/RunMatrix.tsx`, `src/components/admin/eval/RunDetail.tsx`.
- **Modifiés** : `src/lib/audit/actions.ts`, `src/routes/_authenticated/admin.ai.index.tsx` (lien), `src/routes/_authenticated/ameliorations.tsx` (statut), `src/integrations/supabase/types.ts` (auto-régen).
