# Plan : Gestion centralisée de l'IA via une zone admin

## Objectif
Sortir tous les paramètres IA aujourd'hui codés en dur (provider Lovable, modèle `gemini-3-flash-preview`, prompts système) et les rendre éditables dans `/admin/ai`. Permettre de basculer entre Lovable AI Gateway, Azure OpenAI, OpenAI direct, Google Gemini direct, Anthropic, etc., par tâche IA.

## Périmètre — 10 tâches IA à migrer
Tous les `*.functions.ts` sous `src/lib/conciliation/` qui appellent `generateText` :
1. `analyze` (conciliation simple)
2. `analyzePatientConciliationComplete`
3. `analyzePatientSynthesis`
4. `extractOrdonnance`
5. `extractLettreAdmission`
6. `extractBiologie`
7. `matchPrescriptionAI`
8. `pharmacistDoc`
9. `bulkImport`
10. `validateConciliation` / `evaluate` (à confirmer si appel IA)

Chacune devient une **AI Task** identifiée par un slug (ex. `extract_ordonnance`).

## Architecture cible

```text
┌─ Admin UI (/admin/ai) ──────────────────────────────────┐
│  • Providers : CRUD (Lovable / Azure / OpenAI / Gemini) │
│  • AI Tasks  : liste + édition prompt + choix provider  │
│  • Versions  : historique + rollback par tâche          │
└────────────────────────┬────────────────────────────────┘
                         │
                ┌────────▼─────────┐
                │   Tables BDD     │
                │  ai_providers    │
                │  ai_tasks        │
                │  ai_prompt_vers. │
                └────────┬─────────┘
                         │
        ┌────────────────▼────────────────┐
        │  runAITask(slug, input)         │  ← nouveau helper serveur
        │  - charge task + provider       │
        │  - déchiffre clé (pgcrypto)     │
        │  - instancie provider AI SDK    │
        │  - generateText(...)            │
        └────────────────┬────────────────┘
                         │
            *.functions.ts existants
            (remplacent leur bloc IA inline par runAITask)
```

## Modèle de données

### `ai_providers`
- `id`, `name` (libellé), `kind` (`lovable`|`azure_openai`|`openai`|`google`|`anthropic`|`openai_compatible`)
- `base_url` (nullable, pour Azure / compatibles)
- `api_key_encrypted` (`bytea`, chiffré via `pgp_sym_encrypt` + clé master en secret)
- `extra_config` (jsonb : `deployment`, `api_version` pour Azure, etc.)
- `is_active`, timestamps

### `ai_tasks`
- `id`, `slug` (unique, ex. `extract_ordonnance`), `label`, `description`
- `provider_id` → `ai_providers`
- `model` (string, ex. `google/gemini-3-flash-preview`, `gpt-4o`, `gemini-2.0-flash`)
- `system_prompt` (text)
- `temperature`, `max_tokens` (nullable)
- `current_version` (int)
- timestamps

### `ai_prompt_versions`
- `id`, `task_id`, `version` (int), `system_prompt`, `model`, `provider_id`, `temperature`, `max_tokens`
- `created_by` (uuid), `created_at`, `note`
- → permet rollback : "restaurer cette version" = recopie dans `ai_tasks`

### `user_roles` + enum `app_role` (`admin`, `user`)
- Pattern standard avec fonction `has_role(uuid, app_role)` SECURITY DEFINER
- RLS sur tables `ai_*` : SELECT/UPDATE réservés à `has_role(auth.uid(), 'admin')`
- Les `*.functions.ts` lisent via `supabaseAdmin` (service role) → pas bloqués par RLS

### Chiffrement des clés API
- Activer `pgcrypto`
- Master key dans secret `AI_PROVIDERS_ENCRYPTION_KEY` (Lovable Secrets)
- Fonctions serveur `encryptApiKey(plain)` / `decryptApiKey(row)` côté serveur uniquement
- L'UI admin envoie la clé en clair via HTTPS → server fn chiffre avant insert
- Affichage admin : clé masquée (`••••••••1234`) + bouton "remplacer"

## Helper central : `runAITask`

`src/lib/ai/runAITask.server.ts` :
- Charge `ai_tasks` par slug + son provider
- Déchiffre la clé API
- Instancie le bon client AI SDK :
  - `lovable` → `createLovableAiGatewayProvider` (helper existant)
  - `openai` → `@ai-sdk/openai`
  - `azure_openai` → `@ai-sdk/azure`
  - `google` → `@ai-sdk/google`
  - `anthropic` → `@ai-sdk/anthropic`
- Retourne `{ model, systemPrompt, temperature, maxTokens }` prêts pour `generateText`

Signature côté tâches :
```ts
const { text } = await runAITask("extract_ordonnance", {
  prompt: userMessage,
  // overrides optionnels (rare)
});
```

Les `*.functions.ts` perdent ~15 lignes chacun de plomberie provider/modèle/prompt.

## Migration des prompts existants
Migration SQL unique qui :
1. Crée les 3 tables + enum + `user_roles` + `has_role`
2. Insère 1 ligne dans `ai_providers` (Lovable, clé = placeholder / depuis env)
3. Insère 10 lignes dans `ai_tasks` avec les prompts système actuels copiés depuis le code
4. Insère la v1 dans `ai_prompt_versions` pour chaque tâche
5. GRANTs + RLS + policies

Les prompts en dur dans le code restent comme **fallback** (si tâche introuvable en BDD → log warning + utilise constante locale) le temps que la migration soit jouée.

## UI Admin (`/admin/_admin/ai/`)
Route gardée par `_admin` layout (`beforeLoad` : `has_role('admin')` via server fn).

Pages :
- `/admin/ai` — Dashboard : liste tâches + provider/modèle utilisé, dernière édition
- `/admin/ai/providers` — CRUD providers (form : nom, kind, base_url, clé, extras)
- `/admin/ai/tasks/$slug` — éditeur d'une tâche :
  - Sélecteur provider + champ modèle (autocomplete par provider)
  - Textarea prompt système (gros, monospace)
  - Sliders temperature / max_tokens
  - Bouton **Tester** (envoie un prompt court et affiche la réponse)
  - Bouton **Enregistrer** → bump version, copie ancienne dans `ai_prompt_versions`
- `/admin/ai/tasks/$slug/history` — liste versions + diff + bouton "Restaurer"

Composants : shadcn (`Form`, `Card`, `Tabs`, `Table`, `Dialog`, `Textarea`).

## Server functions à créer
`src/lib/admin/ai.functions.ts` (toutes gardées par `requireSupabaseAuth` + check admin) :
- `listProviders`, `upsertProvider`, `deleteProvider`
- `listTasks`, `getTask`, `updateTask` (crée auto la nouvelle version)
- `listTaskVersions`, `restoreTaskVersion`
- `testTask({ slug, sampleInput })`

## Étapes d'implémentation (ordre d'exécution)

1. **Migration BDD** : `pgcrypto`, tables `ai_*`, `user_roles`, enum, `has_role`, GRANTs, RLS, seed des 10 tâches.
2. **Secret** `AI_PROVIDERS_ENCRYPTION_KEY` (générer 32 bytes random).
3. **Helper** `runAITask.server.ts` + installation des providers AI SDK utilisés (`@ai-sdk/openai`, `@ai-sdk/azure`, `@ai-sdk/google`).
4. **Refactor** des 10 `*.functions.ts` pour utiliser `runAITask` (un fichier à la fois, garder le fallback).
5. **Layout admin** `_authenticated/_admin/route.tsx` (gate role).
6. **Pages admin** providers + tasks + history.
7. **Bouton "Tester"** dans l'éditeur.
8. Promouvoir manuellement votre user en admin via une migration `INSERT INTO user_roles`.

## Hors périmètre (à valider plus tard si besoin)
- Streaming (`streamText`) côté admin — pas utilisé actuellement.
- A/B testing entre versions de prompt.
- Métriques d'usage / coût par tâche (table `ai_runs` future).
- UI pour gérer les modèles autorisés par provider (pour l'instant champ libre).

## Notes techniques
- Aucun changement au pattern `*.functions.ts` côté appelant (les composants continuent d'appeler les mêmes server fns).
- L'`api_key_encrypted` n'est jamais renvoyée à l'UI, même chiffrée.
- Les server fns admin utilisent `supabaseAdmin` pour bypass RLS après check de rôle explicite.
- Compatible avec la stratégie de cache : pas de changement aux invalidations existantes.
