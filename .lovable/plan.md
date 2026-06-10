# Plan — Piste #6 v2 : Intégration SIH (FHIR R4 + amorces HL7/INS)

La v1 (livrée) accepte un Bundle FHIR collé en UI et le convertit via le pipeline pseudonymisé. La v2 industrialise cette base sans encore exiger une connexion SIH réelle (qui dépend d'une convention DSI hors-app).

## Périmètre v2

### 1. Endpoint FHIR serveur (entrant)
- Route `src/routes/api/public/fhir/$.ts` (splat) acceptant :
  - `POST /api/public/fhir/Bundle` — réception d'un Bundle (transaction/collection)
  - `GET /api/public/fhir/metadata` — CapabilityStatement minimal (resourceType, interactions supportées)
- Sécurité : header `X-ConcilMed-Org-Token` (HMAC-SHA256 du body avec un secret par organisation, stocké chiffré dans `organizations.fhir_ingest_secret_encrypted`).
- Validation : Zod sur l'enveloppe Bundle, taille max 5 Mo, rejet si pas `resourceType: "Bundle"`.
- Réponse : OperationOutcome FHIR conforme (issue.severity, diagnostics).
- Réutilise `fhirBundleToCsvRows` + pipeline `confirmImport` interne.

### 2. Adaptateur FHIR étendu
Enrichir `fhirToConcilMed.server.ts` pour couvrir :
- `AllergyIntolerance` → table `allergies` (substance, criticité, manifestation).
- `Condition` → table `antecedents` / `comorbidites`.
- `Observation` (laboratoire LOINC) → table `biologie_resultats`.
- `MedicationRequest.dosageInstruction` : extraction quantité + unité + fréquence (timing.repeat).
- Identifiants : reconnaître `identifier.system` INS-NIR (urn:oid:1.2.250.1.213.1.4.10) → marquer mais ne JAMAIS stocker en clair (toujours passer par pseudonymisation HMAC).

### 3. Push sortant (sortie de conciliation vers SIH)
- ServerFn `exportConciliationFhir({ validationId })` qui produit :
  - `MedicationStatement[]` pour chaque ligne validée (effective, ongoing).
  - `DocumentReference` enveloppant le PDF de la lettre de conciliation (base64, type LOINC 56445-0).
- ServerFn `pushConciliationToEndpoint({ validationId, endpointUrl, authHeader })` qui POSTe le Bundle. Stockage du log de push dans nouvelle table `fhir_push_logs` (status, response, retry_count).
- UI dans la page de validation : bouton « Exporter en FHIR » (téléchargement JSON) et « Pousser vers SIH » (si endpoint configuré sur l'organisation).

### 4. Configuration SIH par organisation
Nouvelle table `organization_sih_config` :
- `organization_id`, `fhir_base_url`, `auth_kind` (none|bearer|hmac), `auth_secret_encrypted`, `ins_oid`, `ipp_authority_oid`, `is_active`.
- RLS : admins de l'org uniquement.
- UI `/admin/sih-config` (org-scopée) avec test de connexion (GET CapabilityStatement).

### 5. Stub HL7 v2 (documentation + parseur minimal)
- `src/lib/dataIngest/hl7v2.server.ts` : parseur de segments `MSH|PID|RXE` (lecture seule, regex), conversion vers le même format CSV. Pas d'endpoint MLLP (impossible en Worker). Documentation : nécessite passerelle externe (Mirth, Iguana) qui POSTe en HTTP vers notre endpoint FHIR ou un nouveau `/api/public/hl7`.
- UI : zone de texte « Coller un message HL7 v2 » sur `/admin/import-fhir` (onglet supplémentaire).

### 6. Carnet d'identités (INS-style)
- Sur `patients` : ajouter `ins_pseudo` (hash HMAC séparé de `external_pseudo`, dédié à l'INS) et `ipp_authority_oid`.
- Permet matching entre imports de sources différentes (FHIR + CSV + HL7) sans révéler l'INS clair.

### 7. Observabilité
- Réutiliser `conciliation_events` avec nouvelles étapes : `fhir_ingest`, `fhir_push` (kind=action, metadata=resourceCounts).
- Dashboard `/conciliation/metriques` : ajouter une carte « Ingestions FHIR / push » (volume 7 j).

## Migrations DB
```text
- ALTER organizations ADD fhir_ingest_secret_encrypted bytea
- CREATE TABLE organization_sih_config (...) + GRANT + RLS
- CREATE TABLE fhir_push_logs (...) + GRANT + RLS
- ALTER patients ADD ins_pseudo text, ipp_authority_oid text + index unique (organization_id, ins_pseudo)
```

## Fichiers à créer / modifier
```text
src/routes/api/public/fhir/$.ts                    NEW (endpoint entrant)
src/lib/sih/fhirIngest.functions.ts                NEW (logique ingest réutilisable)
src/lib/sih/fhirExport.functions.ts                NEW (MedicationStatement + DocumentReference)
src/lib/sih/fhirPush.functions.ts                  NEW (POST distant + log)
src/lib/sih/sihConfig.functions.ts                 NEW (CRUD config + test connexion)
src/lib/dataIngest/fhirToConcilMed.server.ts       EDIT (AllergyIntolerance, Condition, Observation, INS)
src/lib/dataIngest/hl7v2.server.ts                 NEW (parseur minimal)
src/routes/_authenticated/admin.sih-config.tsx     NEW
src/routes/_authenticated/admin.import-fhir.tsx    EDIT (onglet HL7 + bouton "Token endpoint")
src/components/conciliation/ExportFhirButtons.tsx  NEW (intégré à la page validation)
src/routes/_authenticated/ameliorations.tsx        EDIT (statut "Livré v2")
```

## Hors-périmètre (explicite)
- Connexion MLLP/HL7 native (impossible en runtime Worker).
- Conformité Ségur formelle (audit hors-app, nécessite environnement de qualification SIH).
- Push automatique sur trigger DB (sera couvert par pg_cron dans une piste ultérieure).

## Points à confirmer
1. Le push sortant doit-il être manuel (bouton) ou aussi automatique à la validation ?
2. Faut-il dès maintenant la table `fhir_push_logs` ou différer tant qu'aucun SIH n'est connecté ?
3. Le parseur HL7 v2 est-il utile dès v2 ou peut-on reporter à v3 (faible ROI sans passerelle) ?
