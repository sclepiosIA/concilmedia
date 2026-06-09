
# Échelle de tri "FRENCH-MED" — relecture de la conciliation

Inspirée de la FRENCH (SFMU) : 5 paliers codés couleur, du plus urgent (1) au moins urgent (5), calculés automatiquement à partir des données déjà présentes (score de risque, divergences détectées, statut de validation). Affichage en pastille sur chaque ligne de la liste des patients + filtre/tri.

## Les 5 paliers

```text
P1  ROUGE     Immédiat       À relire maintenant
P2  ORANGE    Très urgent    À relire < 1 h
P3  JAUNE     Urgent         À relire < 6 h
P4  VERT      Standard       À relire < 24 h
P5  BLEU      Non urgent     Relecture programmée / déjà validée
```

## Règles de classement (auto, par patient — pire épisode actif)

Calcul côté client à partir des données déjà chargées, prend le pire des critères :

- **P1 — Immédiat**
  - ≥ 1 divergence non intentionnelle de gravité `critique` non résolue, **ou**
  - score de risque `critique` (≥ 70) **et** aucune validation pharmacien.
- **P2 — Très urgent**
  - ≥ 1 divergence `majeur` non résolue, **ou**
  - score `eleve` (50–69) sans validation, **ou**
  - ≥ 3 divergences non intentionnelles non résolues.
- **P3 — Urgent**
  - divergences `modere` non résolues, **ou**
  - score `modere` (30–49) sans validation, **ou**
  - analyse IA présente mais aucune relecture pharmacien depuis > 24 h.
- **P4 — Standard**
  - divergences uniquement `mineur` non résolues, **ou**
  - conciliation à faire mais score `faible`.
- **P5 — Non urgent**
  - conciliation validée par un pharmacien et aucune divergence non résolue restante,
  - ou patient sans épisode de conciliation en cours.

Surcouche d'ancienneté : si une analyse IA est en attente de relecture depuis > 48 h, on remonte d'un palier (sans dépasser P1).

## UI

- **Pastille FRENCH-MED** : carré arrondi 28×28 px, numéro 1–5, couleur du palier, tooltip = libellé + raison principale (« Divergence critique non résolue », « Validé le … », etc.).
- **Listing patients** (`patients.index.tsx`) :
  - Colonne pastille en tête de chaque carte patient (à gauche de l'avatar).
  - Barre d'actions au-dessus : tri par défaut = palier croissant (P1 d'abord) ; filtre rapide « Tous / À relire (P1–P3) / Validés (P5) ».
  - Compteurs en haut : `P1: 2 · P2: 5 · P3: 8 · P4: 12 · P5: 30`.
- **Légende** : popover « ? » à côté du titre expliquant les 5 paliers.

## Détails techniques

- Nouveau fichier `src/lib/conciliation/triageScale.ts` :
  - type `TriageLevel = 1|2|3|4|5`, constantes `TRIAGE_META` (label, couleur, délai, classe Tailwind).
  - fonction `computePatientTriage(input)` pure, prend `{ activeEpisodes, riskScores, divergences, validations }` et renvoie `{ level, reason }`.
- Nouveau composant `src/components/conciliation/TriageBadge.tsx`.
- Nouveau hook `src/hooks/usePatientsTriage.ts` :
  - une requête React Query agrégée qui charge en un appel pour la liste affichée : derniers `risk_scores`, `conciliation_medicaments` non résolus (group by patient avec max gravité + count), `conciliation_validations` (présence). Pas de N+1.
- Tokens couleurs ajoutés à `src/styles.css` : `--triage-1`…`--triage-5` (rouge, orange, jaune, vert, bleu, déclinés en OKLCH cohérents avec la charte navy/teal).
- Modifs `src/routes/_authenticated/patients.index.tsx` :
  - intégrer le hook, la pastille, le tri/filtre, les compteurs.
  - tri secondaire : date de création desc.

## Hors périmètre

- Pas de stockage en base du palier (recalculé à la volée — toujours à jour).
- Pas de modification de l'algorithme de score de risque existant ni des écrans de détail patient (le palier sera réutilisable plus tard côté `patients.$patientId`).
- Pas de notifications / alertes temps réel.
