# Compatibilité des appels endpoints AI selon le provider

## Constat

Tous les appels passent par `src/lib/ai/runAITask.server.ts` (résolution de la tâche en DB → provider configuré dans l'admin) puis `generateText` de l'AI SDK. Plusieurs incompatibilités existent aujourd'hui :

### 1. Paramètres `temperature` / `maxTokens`
- `runAITask` transmet **toujours** `temperature` (lignes 165, 180).
- Or les modèles **GPT‑5 / GPT‑5.5** (OpenAI et Azure OpenAI) **refusent toute valeur ≠ 1** et renvoient un 400 `Unsupported value: 'temperature'`.
- `max_tokens` n'est plus accepté non plus : il faut envoyer `max_completion_tokens` via `providerOptions.openai` (ou `providerOptions.azure`).
- Le champ `reasoning_effort` (low/medium/high) propre à GPT‑5.x est non géré.

### 2. Provider Azure OpenAI
- `buildModel` passe simultanément `resourceName` **et** `baseURL` à `createAzure` → comportement ambigu.
- Notre endpoint actuel est de type **Azure AI Foundry** (`https://ia-interne-resource.services.ai.azure.com/api/projects/ia-interne`), pas l'endpoint OpenAI standard `*.openai.azure.com`. Il faut router vers `createOpenAICompatible` avec `baseURL` + header `api-key` quand on détecte ce format, sinon `createAzure({ resourceName, apiVersion })`.
- Le `modelId` doit correspondre au **nom de déploiement** Azure (déjà documenté côté UI, à valider côté serveur).

### 3. Provider Lovable Cloud
- OK pour Gemini par défaut. Les modèles `openai/gpt-5.5` sont disponibles via le gateway → mêmes contraintes que OpenAI direct (pas de temperature ≠ 1, `max_completion_tokens`).
- La clé doit rester `process.env.LOVABLE_API_KEY` (fallback déjà présent).

### 4. Appels directs `generateText` dans `src/lib/conciliation/*`
- 8 fichiers appellent `generateText` sans passer `temperature` / `maxTokens` ni `providerOptions`. Ils héritent juste du `model` résolu. C'est cohérent une fois `runAITask` corrigé pour exposer un helper unique.

## Plan d'implémentation

### A. `src/lib/ai/runAITask.server.ts`
1. Ajouter un helper `isGpt5Family(modelId, providerKind)` qui matche `gpt-5`, `gpt-5.x`, `openai/gpt-5*` (Lovable gateway inclus) et les déploiements Azure dont le nom contient `gpt-5`.
2. Construire un objet `callOptions` adapté :
   - GPT‑5.x : **omettre** `temperature`, mapper `max_tokens` → `providerOptions: { openai: { maxCompletionTokens, reasoningEffort } }` (ou `azure` pour Azure).
   - Autres modèles (Gemini, Claude, GPT‑4o, etc.) : conserver `temperature` + `maxOutputTokens` standard.
3. Exporter un nouveau helper `buildGenerateTextArgs(resolved, base)` que tous les `generateText` de `src/lib/conciliation/*` utiliseront, pour garantir un comportement uniforme.

### B. `buildModel` — branche `azure_openai`
1. Détecter l'URL Foundry (`services.ai.azure.com`) : router vers `createOpenAICompatible` avec `baseURL` final (incluant `/openai/v1` ou la version d'API depuis `extra.api_version`) + header `api-key: <apiKey>`.
2. Sinon, ne passer **que** `{ apiKey, resourceName, apiVersion }` à `createAzure` (retirer `baseURL`).
3. Le `modelId` reste le nom de déploiement.

### C. Schéma `ai_tasks` (admin)
- Ajouter un champ optionnel `reasoning_effort` (`low|medium|high`) dans `extra_config` côté UI admin (`admin.ai.tasks.$slug.tsx`), uniquement affiché si le modèle sélectionné est de la famille GPT‑5.x. Pas de migration de schéma : on stocke dans `ai_tasks.extra_config` (jsonb existant) ou on l'ajoute si absent.

### D. Conciliation functions
- Remplacer dans les 8 fichiers `generateText({ model, system, prompt, ... })` par `generateText(buildGenerateTextArgs(resolved, { system, prompt|messages }))` pour appliquer automatiquement les bons paramètres.

### E. Vérification
- Test manuel : déclencher une extraction d'ordonnance avec
  1. Provider Lovable + `google/gemini-3-flash-preview`
  2. Provider Lovable + `openai/gpt-5.5`
  3. Provider Azure IA Interne + déploiement `gpt-5.5`
- Vérifier dans les logs serveur l'absence de 400 et la présence d'une réponse texte non vide.

## Détails techniques (référence)

```ts
// GPT-5.x via OpenAI / Lovable gateway
generateText({
  model,
  system, prompt,
  providerOptions: {
    openai: {
      maxCompletionTokens: resolved.maxTokens,
      reasoningEffort: resolved.reasoningEffort ?? "medium",
    },
  },
});

// Azure Foundry (services.ai.azure.com)
const p = createOpenAICompatible({
  name: "azure-foundry",
  baseURL: `${baseUrl}/openai/v1`,
  headers: { "api-key": apiKey },
});
```

Aucun changement de DB requis ; uniquement du code serveur et la page admin.
