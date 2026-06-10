
# Piste #4 — Passer des données synthétiques aux données réelles

## Cadrage

Le sujet est mi-technique, mi-réglementaire. Les vrais bloquants (hébergeur HDS certifié, convention de mise à disposition, avis DPO/CPP, MR-004) sont des prérequis organisationnels — l'app ne peut pas les produire. Ce que je peux livrer en v1 : **une infrastructure d'ingestion sûre, pseudonymisée, cloisonnée par établissement, avec traçabilité**, pour que dès qu'un établissement partenaire signe, ConcilMed soit prêt à recevoir ses données.

Hors périmètre v1 : connecteur HL7/FHIR temps réel (= piste #6), import DMP (= piste #10), parsing automatique de PDF d'ordonnance (= déjà couvert par OCR).

## Livrables v1

1. **Modèle multi-établissement** : entité `organizations`, rattachement `user_roles` → `organization_id`, cloisonnement RLS strict (un pharmacien ne voit que les patients de son/ses établissements).
2. **Pipeline d'import CSV pseudonymisé** : page admin `/admin/import-reel` qui accepte 3 fichiers normalisés (patients, traitements_habituels, prescriptions_hopital) au format CSV, applique pseudonymisation côté serveur, valide, dry-run avant insert.
3. **Mapping FHIR R4 minimal** : helper serveur qui ingère un bundle FHIR (Patient, MedicationStatement, MedicationRequest, Condition, AllergyIntolerance) → tables ConcilMed. Pas de connecteur réseau, juste l'adaptateur — préparation #6.
4. **Pseudonymisation systématique à l'import** : suppression INS/NIR, hash SHA-256 salé de l'IPP local, décalage aléatoire des dates (±0-30j cohérent par patient), troncature des noms (initiales), suppression des champs texte libre identifiants.
5. **Audit d'import** : table `data_imports` (qui, quand, quel établissement, combien de lignes, hash du fichier source, status, erreurs). Préfigure la piste #13.
6. **Marqueur de provenance** sur `patients` : `data_source: 'synthetic' | 'real_pseudonymized'`, `organization_id`, `imported_via`. L'UI affiche un badge "Données réelles pseudonymisées" pour lever l'ambiguïté.
7. **Garde-fous RGPD** : refus d'ingestion si CSV contient des colonnes interdites (nom complet, NIR, INS, email, téléphone, adresse) — détection par nom de colonne + heuristique regex sur 10 lignes échantillon.
8. **Documentation utilisateur** : page `/admin/import-reel` explique le format attendu, donne un CSV d'exemple téléchargeable, liste les champs interdits et le processus de pseudonymisation. Lien depuis `ameliorations.tsx`.

## Architecture

```text
┌──────────────────────────────────────────────────┐
│  /admin/import-reel  (admin only)                │
│  • Sélection établissement                       │
│  • Upload patients.csv / traitements.csv / ...   │
│  • Dry-run : preview pseudonymisé + erreurs      │
│  • Confirm : insert + audit                      │
└────────────┬─────────────────────────────────────┘
             │ serverFn requireSupabaseAuth + admin
             ▼
   parseCsv  ─►  forbiddenColumnsGuard  ─►  pseudonymize
                                                 │
                                                 ▼
                              dryRun → preview JSON (50 lignes)
                                                 │  (sur confirm)
                                                 ▼
                          insert patients/traitements/prescriptions
                                  + data_imports.log + audit hash
```

## Schéma BDD

Migration unique :

- `organizations` (id, nom, finess?, hds_provider?, created_at) — table de référence
- `organization_members` (organization_id, user_id, role: 'admin'|'pharmacien'|'observateur', unique pair)
- `data_imports` (id, organization_id, imported_by user_id, file_kind: patients|traitements|prescriptions, source_filename, source_sha256, rows_total, rows_inserted, rows_rejected, errors jsonb, status: pending|success|error, started_at, finished_at)
- Ajouts colonnes sur `patients` : `organization_id` (FK), `data_source` (text default 'synthetic'), `external_pseudo` (text, hash IPP), `date_offset_days` (int, pour reconstituer une cohérence interne sans révéler les vraies dates)
- Index : `patients(organization_id, data_source)`, `data_imports(organization_id, started_at desc)`
- RLS :
  - `organizations`, `organization_members` : SELECT autorisé si membre, ALL si admin de l'organisation (via `has_role` + nouvelle `is_org_member(_org_id)`)
  - `patients` : remplace la policy actuelle par "membre de l'organisation OU created_by = auth.uid() pour les données synthétiques héritage"
  - `data_imports` : SELECT membres de l'org, INSERT admins de l'org, ALL service_role
- GRANT explicites : `SELECT, INSERT, UPDATE` sur les nouvelles tables à `authenticated`, `ALL` à `service_role`

## Serveur

Nouveaux fichiers (`src/lib/dataIngest/`) :

1. **`pseudonymize.server.ts`** — Fonctions pures :
   - `hashIpp(ipp: string, salt: string)` → SHA-256 base64url
   - `offsetDate(date, offsetDays)` → décalage cohérent
   - `redactName(nom, prenom)` → initiales `"D. M."`
   - `generateSaltForOrg(orgId)` → dérivé de `DATA_INGEST_SALT` (nouveau secret) + orgId via HMAC, pour qu'un même IPP donne le même pseudo dans une org mais soit incomparable entre orgs
2. **`forbiddenColumns.server.ts`** — Liste de colonnes interdites + regex : `nir`, `numero_securite_sociale`, `^ins$`, `email`, `tel`, `mobile`, `adresse`, `nom_complet`, etc. + détection NIR/email sur échantillon de valeurs.
3. **`csvSchemas.server.ts`** — Schémas Zod stricts pour les 3 CSV attendus :
   - `patients.csv` : `ipp_local, date_naissance, sexe (M|F), poids_kg?, taille_cm?, dfg_ml_min?, allergies (pipe-separated)?, comorbidites?`
   - `traitements.csv` : `ipp_local, dci, voie, forme, dose, unite, frequence, depuis_le?`
   - `prescriptions.csv` : `ipp_local, dci, voie, forme, dose, unite, frequence, debut, fin?, prescripteur_service?`
4. **`ingestReal.functions.ts`** — `createServerFn` avec `requireSupabaseAuth` + check rôle admin de l'org :
   - `previewImport({ orgId, fileKind, csvText })` → parse + pseudonymise + dry-run, retourne `{ sample: 50 lignes pseudonymisées, errors: [], stats: { total, valid, rejected } }`. Ne touche pas la DB.
   - `confirmImport({ orgId, fileKind, csvText, sha256 })` → re-parse, insert via `supabaseAdmin`, écrit `data_imports`. Idempotence via `source_sha256` unique par org.
   - `listImports({ orgId })` → historique.
5. **`fhirToConcilMed.server.ts`** — Adaptateur pur (pas exposé en serverFn v1) : `fhirBundleToCsvRows(bundle)` → 3 tableaux compatibles avec les CSV ci-dessus. Test unitaire avec bundles d'exemple. Sert de fondation à la piste #6.

Le browser n'envoie jamais de service role : tout passe par `createServerFn` + `await import("@/integrations/supabase/client.server")` dans le handler.

## UI

Nouvelle route `/admin/import-reel` (sous `_authenticated/`, gated admin) :

- **Step 1** : sélecteur d'organisation (limité aux orgs où user est admin).
- **Step 2** : 3 zones d'upload (patients/traitements/prescriptions). Hash SHA-256 calculé côté client avant envoi.
- **Step 3** : preview pseudonymisé (tableau de 50 lignes) + liste d'erreurs/warnings + colonnes interdites détectées.
- **Step 4** : bouton "Confirmer l'import" (désactivé si erreurs bloquantes). Loader pendant insertion.
- **Step 5** : récap + bouton "Voir les patients importés" → liste filtrée par `data_source='real_pseudonymized'`.
- **Section historique** : 10 derniers imports avec status, lignes, qui, quand.
- **Bandeau permanent** : "Données pseudonymisées — décalage de dates, IPP hashé, identité réduite. Hébergement HDS requis pour activation en production."

Modifs UI annexes :
- Badge "Données réelles" sur la carte patient quand `data_source='real_pseudonymized'`.
- Filtre dans la liste patients : "Synthétique / Réel pseudonymisé / Tous".
- `ameliorations.tsx` : passe piste #4 à `statut: "Livré v1"`.
- `admin.tsx` : lien vers `/admin/import-reel` à côté de BDPM / RAG / RLHF.

## Sécurité

- Secret nouveau : `DATA_INGEST_SALT` (32 bytes random). Stocké dans secrets Supabase. Utilisé pour dériver le sel par organisation via HMAC — rotation = on perd la jointure entre imports successifs (à documenter).
- Fichiers source CSV ne sont JAMAIS stockés tels quels (uniquement leur SHA-256). Si l'admin a besoin de re-vérifier, il ré-uploade.
- Garde-fou : refus dur si `>5%` des lignes contiennent un pattern NIR ou email même dans une colonne autorisée.
- RLS testée : un user d'org A ne doit pas voir les patients/imports d'org B même avec l'UUID.

## Vérification

1. Migration appliquée, RLS active, nouvelles colonnes visibles sur `patients`.
2. Création d'une organisation `TEST_HOSP_01` + ajout d'un user admin.
3. Upload `patients.csv` jouet avec une colonne `email` → refus avec message clair.
4. Upload propre des 3 CSV → preview montre IPP hashé, dates décalées, noms en initiales.
5. Confirm → patients visibles dans la liste avec badge "Données réelles", `data_imports` enregistre la ligne.
6. Second upload du même fichier → rejet pour duplication (sha256 + org).
7. Login en tant qu'user d'une autre org → patients invisibles.
8. `fhirToConcilMed` : test unitaire sur un bundle Patient + 2 MedicationStatement → 1 ligne patient + 2 lignes traitements correctement mappées.

## Hors périmètre (explicite)

- Pas d'hébergement HDS automatique : prérequis externe.
- Pas de signature électronique de convention dans l'app.
- Pas de connecteur HL7/FHIR live (= piste #6).
- Pas d'export inviolable des audits (= piste #13).
- Pas de cron de purge/rétention (à brancher dans une future itération une fois la politique DPO validée).

## Fichiers touchés

- Migration : `organizations`, `organization_members`, `data_imports`, colonnes sur `patients`, RLS, GRANT.
- Nouveaux : `src/lib/dataIngest/{pseudonymize,forbiddenColumns,csvSchemas,fhirToConcilMed}.server.ts`, `src/lib/dataIngest/ingestReal.functions.ts`, `src/routes/_authenticated/admin.import-reel.tsx`.
- Modifiés : `src/routes/_authenticated/admin.tsx` (nav), `src/routes/_authenticated/ameliorations.tsx` (badge), affichage liste/carte patient (badge + filtre).
- Secrets : ajout `DATA_INGEST_SALT`.
