# Piste #11 v1 — Score de risque iatrogène longitudinal

`risk_scores` est déjà alimenté par épisode (score, niveau, variables, computed_at). Tout est en place pour exploiter l'historique sans changement de schéma majeur.

## Objectifs

1. Suivre la trajectoire du risque iatrogène d'un patient au fil des épisodes.
2. Alerter quand le risque s'aggrave significativement entre deux séjours.
3. Donner une vue populationnelle (établissement / service) au superviseur.

## Lots

### Lot A — Server functions d'historique
Fichier `src/lib/risk/riskTrend.functions.ts` :
- `getPatientRiskTrend({ patientId })` : joint `risk_scores` ↔ `episodes` (filtre par patient), renvoie la série chronologique `{ episode_id, date_entree, service, score, niveau, variables, delta_vs_precedent }`.
- `getRiskAlerts({ patientId? })` : retourne les épisodes où `delta >= +3 points` ou passage de niveau (faible→modéré→élevé), avec contexte.
- `getPopulationRiskStats({ organizationId?, periodDays })` : agrégats — moyenne du dernier score par patient, distribution par niveau, top services à risque, % patients en aggravation.

Toutes protégées par `requireSupabaseAuth`. Lecture seule, pas de migration nécessaire.

### Lot B — UI patient : timeline + delta
- Nouveau composant `src/components/patient/RiskTrendCard.tsx` :
  - mini-courbe SVG (sparkline maison, sans dépendance) du score sur tous les épisodes
  - badge "↑ aggravation" / "↓ amélioration" / "stable" sur le dernier delta
  - liste des facteurs (variables JSONB) qui ont basculé positivement vs épisode précédent
- Intégration dans `patients.$patientId.tsx` via `CollapsibleSection` "Trajectoire du risque iatrogène".

### Lot C — Alertes sur fiche épisode
- Dans `episodes.$episodeId.tsx`, encart en haut : "⚠ Risque en hausse de +X points vs séjour du JJ/MM/AAAA" si delta significatif détecté côté serveur.
- Lien vers la fiche patient pour voir l'historique complet.

### Lot D — Vue populationnelle (superviseur)
- Nouvelle route `src/routes/_authenticated/risk-population.tsx` :
  - filtre période (30/90/365 j) et service
  - cartes KPI : score moyen, % niveau élevé, % patients aggravés
  - tableau "Top patients aggravés" (lien fiche) et "Top services à risque"
- Lien depuis la sidebar (visible si rôle superviseur/admin — `has_role`).

### Lot E — Marquage piste #11
- `ameliorations.tsx` : ajout `statut: "Livré v1"` à la piste #11.

## Détails techniques

- Calcul des deltas : tri par `computed_at` croissant ; `delta = score_n - score_{n-1}` ; basculement de niveau via mapping `faible=1, modéré=2, élevé=3`.
- Seuils alertes : `delta >= +3` OU passage à un niveau supérieur → flag rouge ; `delta <= -3` → vert.
- Sparkline : SVG inline, pas de lib externe (50×120 px, ligne + points colorés par niveau).
- Agrégats populationnels : une seule requête `risk_scores` + `episodes` + `patients`, filtre `organization_id` via `has_role` superviseur.
- Aucune migration SQL. Les types existants suffisent.

## Hors v1
- Forecast prédictif (modèle ML)  → futur v2.
- Notification push / email sur aggravation → futur v2.

## Critères d'acceptation
- Fiche patient affiche la courbe + delta sur tous les épisodes du patient.
- Fiche épisode affiche un encart d'alerte quand le score augmente significativement.
- Route `/risk-population` accessible aux superviseurs uniquement, KPI cohérents.
- Piste #11 marquée "Livré v1" dans l'onglet améliorations.
