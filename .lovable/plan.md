## Problème

Quand on importe 6 PDF du même patient via "Import PDF", la fonction `commitBulkImport` (`src/lib/conciliation/bulkImport.functions.ts`) crée **6 patients en doublon**, et duplique tous les antécédents / comorbidités / allergies / biologie.

Cause :
1. `extractPatientDossier` détecte `existing_patient_id` au moment de l'extraction. Pour 6 PDF d'un patient encore inconnu en base, les 6 items reçoivent `existing_patient_id = null`.
2. Dans la boucle de commit (l. 318-501), chaque item à `existing_patient_id = null` exécute `INSERT INTO patients` (l. 322-335) → 6 patients distincts.
3. La déduplication des antécédents/comorbidités/allergies/biologie n'est exécutée que `if (item.existing_patient_id)` (l. 383) → pour les nouveaux items, aucun dédup intra-batch → tout est dupliqué.
4. Seul le bloc `traitements` (l. 396-399) ré-interroge la DB systématiquement, c'est pourquoi les médicaments sont déjà dédupliqués mais pas le reste.

## Correctif (un seul fichier : `src/lib/conciliation/bulkImport.functions.ts`)

### 1. Résolution d'identité patient avec cache intra-batch

Avant la boucle d'items, créer une map `resolvedPatientByIdentity = Map<string, string>` où la clé est `normalize(nom)|normalize(prenom)|date_naissance ?? ""`.

Dans la boucle, avant la branche "insert patient" :
- Construire `identityKey` à partir de `item.patient.nom/prenom/date_naissance`.
- Si `item.existing_patient_id` est fourni → l'utiliser et l'enregistrer dans la map sous `identityKey`.
- Sinon, si la map contient déjà `identityKey` → réutiliser ce `patientId` (et compter en `updated`, pas `created`).
- Sinon, faire une recherche de sécurité en DB par `nom + prenom (ilike)` + `date_naissance` (même logique que `extractPatientDossier`) ; si trouvé, réutiliser ; sinon `INSERT` puis enregistrer dans la map.

Cela règle le doublon patient même quand plusieurs PDF du même patient arrivent ensemble.

### 2. Déduplication systématique des sections cliniques

Retirer la garde `if (item.existing_patient_id)` (l. 383) : **toujours** charger les `Set` d'antécédents / comorbidités / allergies / biologie déjà présents en DB pour ce `patientId` avant chaque item. C'est déjà ce qui est fait pour `traitements_habituels` (l. 396-399), on étend la même logique aux 4 autres tables. Coût négligeable (1 select par section par PDF).

### 3. Documents sources : pas de changement

Chaque PDF doit rester tracé dans `documents_sources` (l. 344-375) — c'est correct, on garde une ligne par PDF, juste rattachée au bon `patient_id` mutualisé.

### 4. Épisodes hospi : déjà groupés par `patientId`

La map `hospiByPatient` (l. 316) groupe déjà par `patientId`. Une fois le point 1 corrigé, les 6 PDF du même patient produiront **un seul** épisode agrégé, sans changement supplémentaire.

## Vérification

1. Importer 6 PDF du même patient (mélange ordonnance ville, ordo hospi, lettre admission, bilan bio) → un seul patient créé, un seul épisode, antécédents/comorbidités/allergies/bio sans doublons.
2. Réimporter le même lot une 2ᵉ fois → toujours un seul patient (réutilisé), aucune ligne dupliquée ajoutée.
3. Importer 2 patients différents en même temps (3 PDF chacun) → 2 patients créés, chacun avec ses données fusionnées.

## Fichier modifié

- `src/lib/conciliation/bulkImport.functions.ts`
