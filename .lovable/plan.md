## Problème
Le bloc « Score de risque » affiche « non calculé » dès qu'aucune ligne n'existe dans `risk_scores` pour les épisodes du patient (cas fréquent : patient sans épisode ouvert, ou `computePrioritization` jamais déclenché). Le triage actuel s'appuie uniquement sur `risk_scores` → `worstRiskByPatient = null` → `riskComputed = false` → label « non calculé ».

## Objectif
Toujours afficher un niveau de risque pour chaque patient, même sans épisode et sans appel préalable à `computePrioritization`. Le score persisté dans `risk_scores` reste prioritaire ; un **fallback dérivé** est calculé à la volée côté hook quand il manque.

## Approche
Calcul dérivé patient-level directement dans `src/hooks/usePatientsTriage.ts`, à partir des données déjà disponibles dans la base (aucune écriture, pas de migration). Réutilise `computeRiskScore` de `src/lib/conciliation/riskScore.ts`.

### Changements précis
1. **Élargir les requêtes du hook** :
   - `traitements_habituels` : ajouter `dci, nom_commercial` à la sélection (actuellement seulement `patient_id`).
   - `comorbidites` : déjà chargé avec `libelle` — ajouter détection hépatique (`/h[ée]pat|cirrhos|foie/i`) en plus de la rénale.
   - `patients` : déjà charge `date_naissance` → on garde.

2. **Construire pour chaque patient** :
   - `dciByPatient: Map<string, string[]>` (DCI/nom commercial agrégés).
   - `nbComorbByPatient: Map<string, number>`.
   - `hasHepatByPatient: Map<string, boolean>`.

3. **Fallback `worstRisk`** dans la boucle finale :
   ```ts
   let worst = worstRiskByPatient.get(pid) ?? null;
   if (!worst) {
     const r = computeRiskScore({
       age: ageByPatient.get(pid) ?? null,
       via_urgences: false,
       nb_comorbidites: nbComorbByPatient.get(pid) ?? 0,
       has_insuffisance_renale: hasRenaleByPatient.get(pid) ?? false,
       has_insuffisance_hepatique: hasHepatByPatient.get(pid) ?? false,
       traitements_dci: dciByPatient.get(pid) ?? [],
     });
     worst = r.niveau; // "faible" | "modere" | "eleve" | "critique"
   }
   ```
   Passé ensuite à `computePatientTriage({ worstRisk: worst, ... })`.

4. **`TriageBadge`** : aucun changement nécessaire — dès que `worstRisk` est non-null, le badge affiche le niveau au lieu de « non calculé ». La distinction « score persisté vs dérivé » n'est pas demandée par l'utilisateur et serait du bruit visuel.

5. **Sécurité gériatrique** : la garde « patient âgé polymédiqué — priorisation à calculer » de `triageScale.ts` (l. 134-143) devient obsolète puisqu'un score est toujours disponible. On la laisse en place (no-op quand `analysisRun` ou `worstRisk` existent) — pas de modification de `triageScale.ts`.

## Fichier modifié
- `src/hooks/usePatientsTriage.ts` (sélection élargie + fallback dérivé)

## Vérification
- Patient sans épisode → badge affiche « Faible/Modéré/… » selon âge + traitements ville.
- Patient avec `risk_scores` existant → comportement inchangé (la valeur persistée gagne).
- Patient âgé polymédiqué sans analyse → niveau dérivé visible immédiatement.
