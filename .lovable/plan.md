## Objectif

Permettre au pharmacien de **valider la conciliation pharmaceutique complète** proposée par l'IA :
- validation **item par item** (chaque interaction, CI, doublon, adaptation, médicament à haut risque, allergie croisée) avec statut **Accepté / Refusé / Modifié** + commentaire optionnel
- validation **globale** de l'analyse (signature pharmacien : nom auto via `auth.user`, horodatage), qui "fige" l'état de la conciliation
- affichage clair du statut de validation dans la card (badge "Validée le …" / "À valider")
- traçabilité : possibilité de relancer une nouvelle analyse IA, l'ancienne validation reste archivée

## 1) Base de données — migration

Nouvelle table `public.conciliation_validations` :
- `id uuid`
- `analysis_id uuid` → `conciliation_ai_analyses(id) ON DELETE CASCADE`
- `patient_id uuid` → `patients(id) ON DELETE CASCADE` (pour RLS via `owns_patient`)
- `validated_by uuid` → `auth.users(id)`
- `validated_at timestamptz default now()`
- `pharmacien_nom text` (saisi/affiché — fallback `auth.email`)
- `commentaire_global text`
- `item_decisions jsonb` — tableau `{ category, index, status: 'accepted'|'rejected'|'modified', comment?, modification? }`
- contrainte unique `(analysis_id)` → une seule validation par analyse (relancer l'IA crée une nouvelle ligne d'analyse à valider à nouveau)
- GRANT `SELECT/INSERT/UPDATE/DELETE` à `authenticated`, GRANT ALL à `service_role`
- RLS activée + policy `owns_patient(patient_id)`

## 2) Server functions

`src/lib/conciliation/validateConciliation.functions.ts` :
- `saveConciliationValidation({ analysisId, patientId, pharmacienNom, commentaireGlobal, itemDecisions })` — upsert sur `analysis_id`
- `getConciliationValidation({ analysisId })` — récupère la dernière validation

## 3) UI — extension de `ConciliationCompleteCard`

- Header : badge **« À valider »** (warning) ou **« ✓ Validée par X — le … »** (success)
- À côté de chaque alerte rendue par `ClinicalAlertsPanel`, ajouter 3 boutons compacts **Accepter / Modifier / Refuser** + champ commentaire repliable. Pour ne pas casser `ClinicalAlertsPanel` (réutilisé sur la page épisode), je passe un prop optionnel `validationMode` + `onItemDecision` + `decisions`.
- En bas de la card, panneau de signature : champ "Nom du pharmacien" (pré-rempli avec `auth.user_metadata.full_name || email`), commentaire global, bouton **« Valider la conciliation »**.
- Une fois validée : tous les contrôles deviennent en lecture seule, badge vert, bouton "Modifier la validation" pour rouvrir.
- Relancer l'analyse IA → nouvelle ligne d'analyse → la validation précédente reste archivée mais l'UI repart sur "À valider".

## 4) Export

Le badge "✓ Validée par X" est aussi inclus dans le futur export PDF (hors scope ici, à ajouter dans une itération suivante si besoin).

## Fichiers touchés

**Créés**
- Migration `conciliation_validations` (table + RLS + grants)
- `src/lib/conciliation/validateConciliation.functions.ts`
- `src/components/patient/ConciliationValidationPanel.tsx` (signature pharmacien)

**Modifiés**
- `src/components/patient/ConciliationCompleteCard.tsx` — chargement validation, statut, signature, passage decisions à `ClinicalAlertsPanel`
- `src/components/conciliation/ClinicalAlertsPanel.tsx` — props optionnelles `validationMode`, `decisions`, `onItemDecision` ; rendu des boutons Accepter/Modifier/Refuser + commentaire par item (sans casser l'usage existant sur la page épisode)
- `src/integrations/supabase/types.ts` (auto-régénéré)

## Hors-scope

- Validation à plusieurs niveaux (pharmacien + médecin)
- Workflow de notification
- Export PDF de la conciliation validée (peut suivre)
