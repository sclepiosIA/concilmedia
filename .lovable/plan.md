## Diagnostic

Le blocage « Analyse en cours… » sur la conciliation vient de la modification du fetch wrapper de `ai-gateway.server.ts` faite au tour précédent : j'injectais `reasoning_effort: "low"` dans **tous** les corps `/chat/completions`, y compris pour Gemini (modèle par défaut `google/gemini-3-flash-preview`).

D'après la doc canonique du Lovable AI Gateway (`ai-sdk-lovable-gateway`), le wrapper `fetch` ne doit faire qu'une chose : propager le header `X-Lovable-AIG-Run-ID`. Toute mutation du body côté gateway est hors-pattern et casse les modèles qui n'attendent pas `reasoning_effort` (Gemini Flash → 400 ou stalling).

## Correctif

1. **Reverter** `src/lib/ai-gateway.server.ts` au wrapper canonique (suppression de la mutation du body, on garde uniquement la logique de run-id).
2. **Appliquer `reasoning_effort: "low"` au bon endroit** : dans le `resolveAITask` / `runAITask.server.ts` (ou équivalent qui construit `callOptions`), n'ajouter `providerOptions` / `reasoning_effort` qu'aux modèles qui le supportent — préfixe `openai/gpt-5*`. Les autres restent inchangés.
   - Si tu préfères, alternative plus simple : ne **rien** mettre par défaut et laisser chaque endpoint passer `reasoning_effort: "low"` explicitement quand utile.

## Question

Pour le point 2, deux options : (A) injection ciblée gpt-5 uniquement dans `runAITask.server`, ou (B) retrait total de la valeur par défaut et configuration par endpoint. Dis-moi laquelle tu préfères, je n'avance pas sans ton feu vert.

## Fichiers touchés

- ✏️ `src/lib/ai-gateway.server.ts` — revert au wrapper canonique (run-id seulement).
- ✏️ `src/lib/ai/runAITask.server.ts` (option A) — injection ciblée `openai/gpt-5*`.
