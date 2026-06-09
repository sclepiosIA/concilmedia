## Objectif

Éliminer les rechargements involontaires : retour sur l'onglet, navigation entre pages, et "refresh seul" aléatoire pendant l'utilisation.

## Diagnostic

Trois sources principales identifiées dans le code :

1. **`src/routes/__root.tsx` (lignes 97-104)** — le listener `supabase.auth.onAuthStateChange` appelle `router.invalidate()` + `queryClient.invalidateQueries()` sur **tous** les événements `SIGNED_IN` et `USER_UPDATED`. Or Supabase émet `SIGNED_IN` :
   - au tout premier `getSession()` (donc à chaque retour sur l'onglet quand le SDK re-synchronise),
   - à chaque rafraîchissement de token (toutes les ~50 minutes),
   - quand l'onglet reprend le focus après une mise en veille.
   → **C'est la cause n°1 du "ça refresh tout seul"** : toute l'app perd son cache et recharge.

2. **TanStack Router** — `defaultPreloadStaleTime: 0` (correct avec Query) combiné avec `staleTime: 60_000` sur Query est OK, mais `router.invalidate()` du point 1 vide les loaders ET les queries en même temps, ce qui re-fetch toute la page visible.

3. **Pages détail patient/épisode** — les requêtes sont dans des `useQuery` au lieu d'un `loader` + `useSuspenseQuery`. À la première visite d'une page, on voit "Chargement…" même si la donnée est déjà en cache parent (liste patients). Pas critique mais contribue à l'impression de "refresh".

## Changements

### 1. Stabiliser le listener auth (priorité 1 — résout 90 % du problème)

Dans `src/routes/__root.tsx`, ne déclencher l'invalidation **que** sur les vrais changements de session :

- ignorer `SIGNED_IN` quand l'`access_token` n'a pas changé (cas du re-focus / re-hydratation),
- ignorer `USER_UPDATED` (n'impacte que `auth.user`, pas les données métier),
- sur `TOKEN_REFRESHED` ne rien faire (le client Supabase met le token à jour seul),
- ne réagir réellement qu'aux transitions **non authentifié → authentifié** et **authentifié → non authentifié**.

Mémoriser le dernier `userId` connu dans un `ref` pour détecter le vrai changement.

### 2. Affiner les invalidations après mutations

Dans `patients.$patientId.tsx`, les mutations `uploadLettre` / `reanalyze` invalident 5 clés à la suite. C'est correct fonctionnellement, mais on peut grouper sous un préfixe commun `["patient-data", patientId]` pour réduire à un seul `invalidateQueries({ queryKey: ["patient-data", patientId] })`. Optionnel — on garde si ça allège visiblement les flashs.

### 3. Pages détail : loader + useSuspenseQuery (optionnel, qualité perçue)

Pour `patients.$patientId` et `episodes.$episodeId` :
- déclarer `queryOptions` réutilisables,
- amorcer le cache dans `loader: ({ context, params }) => context.queryClient.ensureQueryData(...)`,
- consommer via `useSuspenseQuery` → plus de "Chargement…" à la navigation depuis la liste (la donnée est pré-chargée pendant l'hover via `defaultPreload: "intent"`).

Ajout dans `src/router.tsx` : `defaultPreload: "intent"` pour pré-charger les routes au survol des liens.

### 4. Tooltips et UI : pas de toucher

`refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `refetchOnMount: false` sont déjà bien configurés globalement — on n'y touche pas.

## Vérification

Après modifications, valider en preview :

1. Ouvrir la liste patients, changer d'onglet 1 min, revenir → **aucun spinner**, aucun re-fetch (vérifier dans Network).
2. Naviguer Patients → fiche patient → épisode → retour → la donnée s'affiche instantanément sans "Chargement…".
3. Laisser l'onglet ouvert 1 h (jusqu'au TOKEN_REFRESHED) → pas de re-render global.
4. Se déconnecter / se reconnecter → l'app se réinitialise bien (le seul cas où on **veut** invalider).

## Détails techniques

- Fichier principal modifié : `src/routes/__root.tsx` (~10 lignes dans `useEffect`).
- Fichier secondaire : `src/router.tsx` (ajout `defaultPreload: "intent"`).
- Optionnel : refactor `patients.$patientId.tsx` et `episodes.$episodeId.tsx` pour pattern loader + `useSuspenseQuery`.
- Aucun changement de schéma BDD, aucune migration.
