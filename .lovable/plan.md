## Objectif

Afficher, pour chaque médicament du domicile **non repris** dans la zone d'alerte « X médicaments du domicile non repris », un **score de gravité ML** (issu de `predictLayer4` — couche 4 « omission severity ») afin de prioriser visuellement les omissions potentiellement les plus dangereuses (anticoagulants, insuline, antiépileptiques, etc.).

## Ce qui sera fait

1. **Nouveau server function** `scoreOmissionsSeverity` (`src/lib/conciliation/scoreOmissions.functions.ts`)
   - Input : `episodeId` + liste de `{ traitement_id, dci, atc_class }`.
   - Récupère le contexte patient (âge, nb de comorbidités, durée séjour, service, nb meds hospi) via `supabaseAdmin`.
   - Appelle `predictLayer4Sync` en batch pour chaque traitement.
   - Retourne `{ [traitement_id]: { severity_score, is_severe, level: 'high'|'moderate'|'low' } }`.
   - Seuils : `≥ 0.7` = haute, `0.4–0.7` = modérée, `< 0.4` = faible.

2. **Hook côté composant** dans `PrescriptionsHospitalieresColumn.tsx`
   - `useQuery(['omission_severity', episodeId, missingIds])` qui appelle le serverFn dès que `missingTreatments` change.
   - Tri des `missingTreatments` par `severity_score` décroissant (les plus graves en haut).

3. **UI dans la zone ambre**
   - Badge de gravité à côté de chaque DCI :
     - 🔴 **Grave** (rouge) — `severity_score ≥ 0.7`
     - 🟠 **Modéré** (orange) — `0.4–0.7`
     - ⚪ **Faible** (gris) — `< 0.4`
   - Tooltip sur le badge : « Score ML omission : 0.82 — médicament à risque (anticoagulant) ».
   - Compteur en en-tête enrichi : « 10 médicaments non repris · **3 graves** ».
   - Tri visuel : graves d'abord.

## Détails techniques

- ML déjà disponible inline (`src/lib/ai/mlConcilmed.server.ts` → `predictLayer4Sync`), pas d'appel externe.
- ATC class : récupérée depuis `traitements_habituels` si présente, sinon `null` (le ML utilise alors le nom).
- Pas de migration DB nécessaire (calcul à la volée, déterministe et rapide).
- Le serverFn utilise `requireSupabaseAuth` (lecture patient/épisode).

## Fichiers touchés

- ➕ `src/lib/conciliation/scoreOmissions.functions.ts`
- ✏️ `src/components/conciliation/PrescriptionsHospitalieresColumn.tsx` (query + badges + tri + compteur)
