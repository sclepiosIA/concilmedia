## Objectif

Permettre, dans le banc d'essai cohorte, de lancer la conciliation IA **simultanément sur plusieurs modèles LLM** et de **comparer leurs performances** (Précision / Rappel / F1 vs gold standard pharmacien, triage, sévérité, vs ML).

Ajouter à la liste des modèles utilisables 3 nouveaux endpoints Azure AI Foundry :
- `claude-opus-4-8` via `https://ia-interne-resource.services.ai.azure.com/anthropic/v1/messages`
- `gpt-5.4` via `https://ia-interne-resource.services.ai.azure.com/openai/v1/responses`
- `gpt-5-nano` via `https://ia-interne-resource.services.ai.azure.com/openai/v1/responses`

## 1. Providers & modèles (DB seed + admin)

Migration SQL pour insérer (ou upsert par `name`) dans `ai_providers` :
- `Azure Foundry — Anthropic` (kind: `anthropic`, base_url: `…/anthropic/v1/messages`, clé: secret `AZURE_OPENAI_API_KEY` existant, `extra_config: { variant: "azure_foundry_anthropic" }`)
- `Azure Foundry — OpenAI Responses` (kind: `azure_openai`, base_url: `…/openai/v1/responses`, `extra_config: { variant: "responses_api" }`)

Mise à jour de `runAITask.server.ts` :
- Brancher la variante `anthropic` Azure Foundry : `createAnthropic({ baseURL, apiKey, headers: { "api-key": apiKey } })` quand `extra.variant === "azure_foundry_anthropic"`.
- Brancher la variante `responses_api` : utiliser `createOpenAI({ baseURL, apiKey }).responses(modelId)` (provider OpenAI Responses) avec en-tête `api-key`.
- Étendre `isGpt5Family` pour matcher `gpt-5.4` et `gpt-5-nano` (déjà couvert par la regex actuelle, vérifier).

Registre des modèles côté UI (`src/lib/ai/availableModels.ts`, **nouveau**) :
```
[
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (Lovable)", providerName: "Lovable AI" },
  { id: "openai/gpt-5", label: "GPT-5 (Lovable)", providerName: "Lovable AI" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (Azure Foundry)", providerName: "Azure Foundry — Anthropic" },
  { id: "gpt-5.4", label: "GPT-5.4 (Azure Foundry)", providerName: "Azure Foundry — OpenAI Responses" },
  { id: "gpt-5-nano", label: "GPT-5 Nano (Azure Foundry)", providerName: "Azure Foundry — OpenAI Responses" },
]
```

## 2. Refactor du moteur de conciliation pour accepter un modèle

`analyzePatientConciliationComplete.functions.ts` :
- Ajouter un input optionnel `{ patientId, modelOverride?: { providerName: string, modelId: string }, runTag?: string }`.
- Si `modelOverride` fourni → `resolveAITask` reçoit un override (modèle + provider explicite) au lieu de la config DB du slug.
- L'insertion dans `conciliation_ai_analyses` enregistre le `model` réel utilisé + une nouvelle colonne `run_tag` (ex. `multi-llm-2026-06-10T14h`) pour pouvoir comparer plusieurs runs sans s'écraser.

`resolveAITask` : accepter un 3e paramètre `override?: { providerName, modelId }` qui contourne le lookup `ai_tasks` et fabrique la config directement à partir du provider trouvé par nom.

## 3. Migration DB

- `ALTER TABLE conciliation_ai_analyses ADD COLUMN run_tag text;` + index `(patient_id, run_tag)`.
- `ALTER TABLE conciliation_medicaments ADD COLUMN run_tag text;` (les divergences IA sont taggées par run).
- `ALTER TABLE cohort_evaluations ADD COLUMN model_label text, ADD COLUMN run_tag text;` + drop unicité existante sur `cohort_id` et remplacer par `UNIQUE(cohort_id, run_tag)`.
- Seed providers Azure Foundry (cf §1).
- GRANTs déjà en place sur ces tables, rien à ajouter.

## 4. Nouveau serverFn `runCohortMultiModel`

`src/lib/cohort/runCohortMultiModel.functions.ts` :
- Input : `{ cohortId, models: Array<{ providerName, modelId, label }> }`.
- Génère un `runTag = "multi-" + nanoid()`.
- Pour chaque patient × chaque modèle : appelle `analyzePatientConciliationComplete` avec `modelOverride` et `runTag` (séquentiel patient par patient, parallèle entre modèles pour un même patient via `Promise.allSettled`).
- Retourne un récap `{ runTag, perModel: [{ label, ok, fail, durationMs }] }`.

`evaluateCohort.functions.ts` : accepter `{ cohortId, runTag? }` ; quand `runTag` fourni, filtrer `conciliation_medicaments` sur ce tag. Stocker une ligne `cohort_evaluations` par `(cohortId, runTag, model_label)`.

Nouveau serverFn `evaluateCohortAllModels({ cohortId, runTag })` : itère sur les `model_label` distincts de ce run, appelle `evaluateCohort` par modèle, renvoie un tableau comparatif.

## 5. UI

`CohortRunTab.tsx` :
- Sélecteur multi (checkbox) sur la liste de modèles dispos. Par défaut le modèle actuel coché.
- Bouton « Lancer conciliation multi-modèles » → appelle `runCohortMultiModel`.
- Barre de progression par modèle.

`CohortResultsTab.tsx` :
- Si plusieurs runs/modèles présents pour la cohorte : tableau comparatif (Modèle | Précision | Rappel | F1 | Triage acc. | Sévérité MAE | Durée moy. | Coût relatif placeholder).
- Graphique barres groupées (recharts déjà dispo) par métrique.
- Conserver l'affichage existant en single-model si un seul run.

## 6. Hors scope

- Pas de gestion fine des coûts/tokens (placeholder seulement).
- Pas de retry automatique en cas d'échec d'un modèle (le run est marqué failed et on continue).
- Pas de re-extraction du gold standard (un seul gold par patient sert de référence).

## Fichiers touchés

- **Nouveaux** : `src/lib/ai/availableModels.ts`, `src/lib/cohort/runCohortMultiModel.functions.ts`, `src/lib/cohort/evaluateCohortAllModels.functions.ts`, migration SQL.
- **Modifiés** : `src/lib/ai/runAITask.server.ts` (variantes Foundry + override), `src/lib/conciliation/analyzePatientConciliationComplete.functions.ts` (modelOverride/runTag), `src/lib/cohort/evaluateCohort.functions.ts` (filtre runTag), `src/components/cohort/CohortRunTab.tsx`, `src/components/cohort/CohortResultsTab.tsx`, `src/integrations/supabase/types.ts` (auto régénéré après migration).
