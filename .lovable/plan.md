# Piste #10 v2 — Interopérabilité DMP / Mon Espace Santé (approfondissement)

La v1 livre l'import HMD (simulé + CSV), le rapprochement et l'ajout aux traitements habituels. La v2 exploite ces données cliniquement et ferme la boucle "lecture DMP → action → écriture DMP".

## Objectifs v2

1. **Analyser** l'historique HMD au-delà du simple listing.
2. **Détecter** les écarts d'observance et les ruptures de délivrance.
3. **Écrire** vers Mon Espace Santé (push lettre de liaison + BCM) — simulé.
4. **Auditer** chaque accès DMP (exigence Ségur).

## Lots de livraison

### Lot A — Analyse observance & ruptures
- Server fn `analyzeHmdAdherence(patientId)` : pour chaque molécule des traitements habituels, calcule à partir du HMD :
  - taux de couverture (jours couverts / jours attendus sur 6 mois — MPR simplifié)
  - dernière délivrance, intervalle moyen
  - statut : `bonne` / `partielle` / `rupture` / `surconsommation`
- Persisté dans une table `hmd_adherence_snapshots` (patient_id, molecule, mpr, statut, computed_at).

### Lot B — Détection d'écarts prescription ↔ délivrance
- Server fn `detectHmdDiscrepancies(patientId)` qui croise `patient_treatments` actifs avec dernières lignes HMD :
  - prescrit mais jamais délivré sur 90 j → alerte rouge
  - délivré mais absent des traitements déclarés → suggestion d'ajout
  - posologie HMD ≠ posologie déclarée → drapeau divergence
- Résultats injectés comme alertes pharmaceutiques dans la fiche patient et l'épisode actif.

### Lot C — Timeline HMD
- Composant `HmdTimeline` (sur fiche patient) : frise 12 mois par molécule (heatmap mensuelle des boîtes délivrées) + survol = prescripteur / pharmacie.
- Filtres par classe ATC et par statut adhérence.

### Lot D — Push Mon Espace Santé (simulé)
- Server fn `pushDocumentToMes({ episodeId, documentType, documentId })` :
  - types supportés : `lettre_liaison`, `bcm`, `plan_pharmaceutique`
  - simule le dépôt MES (table `mes_pushes` : status, ack_id, timestamp, payload_hash)
  - bouton "Pousser vers Mon Espace Santé" sur la page sortie et sur le BCM
- Affichage de l'historique des pushes dans la fiche patient.

### Lot E — Audit & consentement
- Table `dmp_access_audit` (user_id, patient_id, action, timestamp, motif) — un log par lecture/écriture DMP/MES, exigence ANS.
- Champ `consentement_dmp` (booléen + date) sur la fiche patient ; toute opération DMP/MES bloquée sans consentement actif, modale de recueil.

## Détails techniques

- **Migration SQL** : `hmd_adherence_snapshots`, `mes_pushes`, `dmp_access_audit`, colonnes `consentement_dmp_*` sur `patients`. RLS + GRANT sur les 3 tables, RLS via `has_role` (pharmacien/superviseur lecture/écriture, admin all).
- **Server fns** dans `src/lib/dmp/` :
  - `dmpAdherence.functions.ts` (analyse + détection)
  - `mesPush.functions.ts` (push simulé + audit auto)
  - `dmpAudit.functions.ts` (lecture log)
  - toutes protégées par `requireSupabaseAuth` + check rôle + insertion auto dans `dmp_access_audit`.
- **UI** :
  - `src/components/patient/HmdTimeline.tsx`
  - `src/components/patient/HmdAdherenceCard.tsx` (MPR + statuts)
  - `src/components/patient/DmpConsentDialog.tsx`
  - Bouton "Pousser MES" intégré à `episodes.$episodeId.sortie.tsx` et au BCM.
  - Section "Audit DMP" dans la fiche patient (lecture seule).
- **Ameliorations.tsx** : passage de la piste #10 en `Livré v2` une fois les lots A–E terminés.

## Limites assumées (hors v2)
- Pas de vraie connexion DMP/MES (carte CPS, Ségur, ANS) — tout est simulé/journalisé.
- MPR calculé sur déclaratif posologique, pas sur durée de traitement DMP réelle.

## Critères d'acceptation
- Import HMD existant → l'analyse adhérence se calcule et s'affiche.
- Au moins une alerte d'écart visible quand on retire un traitement habituel délivré récemment.
- Push MES enregistré dans `mes_pushes` + ligne d'audit créée.
- Sans consentement DMP actif, tous les boutons DMP/MES sont désactivés avec tooltip.
