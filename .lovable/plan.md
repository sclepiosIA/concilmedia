## Objectif
Afficher en fin de validation pharmacien un **% de corrélation IA ↔ pharmacien**, calculé à partir des décisions prises sur chaque alerte/divergence.

## Calcul
Pour chaque item décidé par le pharmacien :
- `accepté` → 1 (l'IA avait raison)
- `modifié` → 0.5 (partiellement d'accord)
- `refusé` → 0 (désaccord)

Corrélation = `Σ(poids) / nb_items_décidés × 100`, arrondi à l'entier.
- Si aucun item décidé → afficher "—" (pas de score).
- Items sans décision ignorés (et signalés : `X non décidés sur Y`).

## Affichage
Dans `src/components/patient/ConciliationCompleteCard.tsx`, section « Validation pharmacien » :

1. **Mode lecture (validation enregistrée)** — ajouter un encart visible avec :
   - Grand pourcentage coloré (vert ≥80, ambre 50–79, rouge <50)
   - Libellé : « Corrélation IA ↔ pharmacien »
   - Détail : `N acceptés · M modifiés · K refusés sur T alertes`
   - Tooltip/légende expliquant le calcul (accepté = 1, modifié = 0.5, refusé = 0)

2. **Mode édition** — afficher en live le même indicateur juste au-dessus du bouton « Valider » pour que le pharmacien voie son taux d'accord évoluer.

## Détails techniques
- Le calcul réutilise `decisions` (state local) et `totalAlertes` déjà présents (l. 88, 132-140).
- Ajouter un `useMemo` `correlation` à côté de `counts` (l. 142-146).
- Nouveau petit composant interne `CorrelationBadge` (couleur + valeur + sous-ligne).
- Aucune modif backend, aucun changement de schéma : le score est dérivé à la lecture.

## Fichier modifié
- `src/components/patient/ConciliationCompleteCard.tsx`
