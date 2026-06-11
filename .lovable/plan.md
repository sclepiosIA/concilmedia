# Piste #12 v1 — Mode dégradé (LLM indisponible)

Le moteur déterministe (détection divergences, score iatrogène ML inline, conciliation algorithmique) tourne déjà sans LLM. Cette v1 rend l'app **utilisable en continu** quand les providers IA externes (Lovable Gateway, Azure OpenAI, etc.) sont indisponibles : on détecte la panne, on bascule un état global, on neutralise les panneaux IA proprement et on prévient l'utilisateur.

Hors scope v1 : auto-hébergement Mistral/Llama (mise en place infra), bascule provider de secours automatique, file d'attente offline avec rejeu.

## Lots

### Lot A — Détection & statut serveur
`src/lib/ai/aiHealth.functions.ts` :
- `getAiGatewayHealth()` (serverFn, auth) : ping rapide (timeout 4 s) sur Lovable Gateway via `runAITask("ai-healthcheck", { prompt: "ping" })` avec un prompt minimal. Renvoie `{ status: "ok" | "degraded" | "down", latencyMs, message, providerKind, checkedAt }`.
- Cache mémoire 60 s côté serveur (Map module-level) pour ne pas marteler le provider.
- Toute erreur 5xx / réseau / timeout / `429`/`402` → `degraded`.

### Lot B — Hook & contexte client
`src/hooks/useAiHealth.ts` :
- `useQuery` qui appelle `getAiGatewayHealth` toutes les 60 s, `refetchOnWindowFocus: true`.
- Expose `{ degraded: boolean, status, message, latencyMs, refetch }`.
- Persistance soft : dernier état dans `sessionStorage` pour éviter le flash au premier render.

### Lot C — Bannière UI globale
Dans `src/routes/_authenticated/route.tsx` :
- Sous le header, bannière jaune si `status === "degraded"` / rouge si `down` : "Mode dégradé — les fonctions IA sont temporairement indisponibles. Conciliation algorithmique, score ML inline et exports restent opérationnels."
- Bouton "Réessayer" → `refetch()`.

### Lot D — Désactivation gracieuse des panneaux IA
Composants à rendre « dégradés » (au lieu de planter / spinner infini) :
- `AIAnalysisPanel`, `AISynthesisHeader`, `ClinicalRecommendationsCard`,
- bouton « Synthèse IA » dans la fiche patient,
- bouton « Conciliation IA complète » et « Lettre de liaison IA » sur sortie,
- panneaux IA admin (RLHF, banc d'essai).

Pour chacun, lecture du hook → si dégradé : message d'indisponibilité + CTA "Réessayer" + lien vers une doc courte. Boutons disabled. Les actions déjà lancées restent affichées (résultats historiques DB).

### Lot E — Surface de transparence
- Petit indicateur de statut IA dans le header (point vert/jaune/rouge + tooltip latence) cliquable → ouvre un popover récap (provider courant, dernière vérif, message).
- Page `/admin/ai` : encart "État providers" qui affiche le résultat de `getAiGatewayHealth` + bouton « Tester ».

### Lot F — Marquage piste #12
`ameliorations.tsx` : `statut: "Livré v1"` sur la piste #12, mention "v2 = LLM auto-hébergé".

## Détails techniques

- Aucune migration nécessaire.
- `getAiGatewayHealth` réutilise `runAITask` avec un prompt 1 token, `max_tokens: 1` — coût négligeable.
- Cache : `let cache: { value, expiresAt } | null` dans le module ; pas de Redis (single-region).
- Bannière : composant `AiHealthBanner` placé dans `AuthLayout` sous `<header>`.
- Hook centralisé `useAiHealth()` lu par bannière, indicateur header et tous les panneaux IA → une seule query partagée via clé `["ai-health"]`.
- Pas de service worker / PWA (hors scope v1).

## Critères d'acceptation
- Quand le provider IA est OK : aucune bannière, indicateur vert dans le header.
- Quand on coupe la clé `LOVABLE_API_KEY` (ou que la gateway répond 5xx) : bannière jaune en ≤ 60 s, panneaux IA affichent un état "indisponible" cliquable, conciliation algorithmique + score iatrogène + exports PDF continuent de fonctionner.
- "Réessayer" relance la vérification immédiatement.
- Piste #12 marquée "Livré v1".
