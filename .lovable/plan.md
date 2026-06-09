## Objectif

Améliorer la lisibilité de la légende de tri en haut de `/patients`, enrichir le tooltip du badge **P** (priorité FRENCH-MED), et ajouter des aperçus au survol pour **traitements / antécédents / allergies / alertes** directement sur chaque ligne de la liste patients.

---

## 1. Légende en haut — meilleure lisibilité

Fichier : `src/routes/_authenticated/patients.index.tsx` (chips P1…P5 lignes 269-291).

Actuellement on a juste `P1 12` dans une pastille colorée — il faut deviner ce que c'est. Refonte :

- Remplacer chaque chip par une "pill" plus large avec : badge couleur **+ libellé court** (`Immédiat`, `< 1 h`, `< 6 h`, `< 24 h`, `Validés`) + compteur en pastille à droite.
- Police légèrement plus grande (`text-sm`), padding plus généreux, contraste renforcé (utiliser `m.fg` sur `m.bg` mais aussi un fond plus opaque que `--triage-x-bg` quand `count > 0`, et état "grisé" quand `count === 0`).
- Rendre les pills cliquables : un clic filtre la liste sur ce palier (état `filterMode` étendu pour accepter `"p1" | "p2" | … | "p5"` en plus de `all/todo/done`). Un second clic désactive.
- Préfixer par un petit label discret `Tri : ` pour clarifier le sens.

Le `ToggleGroup` "Tous / À relire / Validés" reste à droite.

## 2. Tooltip du badge P enrichi

Fichier : `src/components/conciliation/TriageBadge.tsx` + `src/hooks/usePatientsTriage.ts`.

Aujourd'hui le tooltip affiche seulement `code — label`, `delay`, et `reason`. On enrichit pour donner au pharmacien tout ce dont il a besoin pour décider sans cliquer.

Étendre `TriageResult` (dans `triageScale.ts`) avec un champ optionnel `details` :

```ts
details?: {
  divergences: { critique: number; majeur: number; modere: number; mineur: number };
  nbNonIntentionnelles: number;
  worstRisk: NiveauRisque | null;
  hasValidation: boolean;
  hasActiveEpisode: boolean;
  pendingSinceHours: number | null;   // ancienneté de l'analyse IA non relue
};
```

`computePatientTriage` et `usePatientsTriage` remplissent ces champs (les données sont déjà calculées localement, c'est juste de l'exposition).

`TriageBadge` accepte une nouvelle prop optionnelle `details` et son tooltip affiche, en plus de l'existant :
- Une ligne "Divergences :" avec mini-puces colorées par gravité et compteurs (ex: `● 1 critique · ● 2 majeures · ● 3 modérées`), masque les zéros.
- "Dont non intentionnelles : N" si > 0.
- "Score de risque : Critique/Élevé/…" avec dot coloré.
- "Validation pharmacien : ✔ oui / ✘ non".
- "Épisode actif : oui/non".
- "En attente depuis : 52 h" si `pendingSinceHours != null`.
- `reason` conservé en italique en bas.

Largeur tooltip portée à `max-w-sm`, typographie clarifiée.

## 3. Tooltips au survol de chaque dossier patient

Fichier : `src/routes/_authenticated/patients.index.tsx` (ligne patient 302-332) + nouveau composant `src/components/patient/PatientRowQuickInfo.tsx`.

À droite du nom (avant le bouton supprimer), ajouter 4 petites icônes-badges discrètes, chacune avec un compteur :

| Icône (lucide) | Libellé | Source | Tooltip au survol |
|---|---|---|---|
| `Pill` | Traitements | `traitements_habituels` actifs | Liste : `DCI (dosage, voie) — fréquence`, max 8 + "…et N de plus" |
| `Stethoscope` | Antécédents | `comorbidites` (statut actif) | Liste : `intitulé — date début` |
| `ShieldAlert` | Allergies | `allergies` | Liste : `substance — réaction — sévérité` avec puce colorée par sévérité |
| `AlertTriangle` | Alertes | divergences non résolues + dernière analyse IA (`conciliation_ai_analyses`) | Top 5 alertes : `gravité — libellé`, lien implicite (la carte entière reste le lien vers le patient) |

Si le compteur est à 0, l'icône est rendue grisée (opacité 40 %) sans tooltip "rien à signaler" parasite (on garde un tooltip court "Aucune allergie", etc.).

Comportement & performance :
- Un seul hook batché `usePatientsQuickInfo(patientIds: string[])` (nouveau fichier `src/hooks/usePatientsQuickInfo.ts`) qui fait 4 requêtes Supabase `in("patient_id", ids)` en parallèle, agrège par `patient_id`, mêmes options que `usePatientsTriage` (`staleTime 5 min`, pas de refetch focus/mount/reconnect, `keepPreviousData`).
- Pour les alertes : on réutilise `divs` (conciliation_medicaments non résolus, déjà chargé côté triage mais ici on garde un hook dédié pour éviter le couplage). On agrège top 5 par gravité décroissante.
- Le clic sur les badges ne navigue pas (les icônes sont dans un `span` à part, hors du `<Link>`), mais le survol affiche le tooltip via `Tooltip` shadcn (déjà importé).

## 4. Composant `PatientRowQuickInfo`

Petit composant pur affichage :

```tsx
<PatientRowQuickInfo info={quickInfoMap[p.id]} />
```

Rend les 4 icônes-badges + compteurs + tooltips. Conserve `TooltipProvider` unique en haut de la liste (passe `delayDuration={200}`) pour éviter de multiplier les providers.

## 5. Détails techniques

### Fichiers modifiés
- `src/lib/conciliation/triageScale.ts` — ajoute `details` à `TriageResult`, le remplit dans `computePatientTriage`.
- `src/hooks/usePatientsTriage.ts` — transmet les chiffres déjà calculés (divergences par gravité, worstRisk, validations, ancienneté) dans `details`.
- `src/components/conciliation/TriageBadge.tsx` — tooltip enrichi.
- `src/routes/_authenticated/patients.index.tsx` — légende refondue (pills cliquables), filtres P1…P5, intégration `PatientRowQuickInfo`, wrap par un seul `TooltipProvider`.

### Fichiers créés
- `src/hooks/usePatientsQuickInfo.ts` — fetch batché (traitements / comorbidités / allergies / divergences) + agrégation.
- `src/components/patient/PatientRowQuickInfo.tsx` — affichage des 4 icônes + tooltips.

### Hors-périmètre
- Pas de changement backend / SQL / RLS (toutes les tables sont déjà lisibles côté authentifié).
- Pas de modification de la page patient détaillée.
- Pas de modification du calcul de priorité lui-même (juste exposition des détails déjà calculés).
