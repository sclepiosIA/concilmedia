## Piste #13 v2 — Audit & traçabilité étendus

La v1 a posé l'infrastructure (table append-only `audit_log`, hash chain SHA-256, RPC `append_audit_log`, page admin `/admin/audit` avec vérification d'intégrité et export CSV, premier point instrumenté `ai_analysis_run`). La v2 étend la couverture, durcit l'export et formalise la rétention.

### Lot A — Instrumentation transverse des actions sensibles

Ajout d'appels `recordAudit({ action, entityType, entityId, payload })` aux points clés (côté serveur quand possible, sinon côté UI après succès) :

- **Patient / DMP** : consultation fiche patient (`patient_view`), modification consentement DMP (déjà tracé en `dmp_access_audit` → miroir vers `audit_log` pour la chaîne unifiée), accès historique DMP (`dmp_history_view`).
- **Épisode & conciliation** : ouverture épisode (`episode_view`), validation BMO (`bmo_validate`), validation conciliation sortie (`sortie_validate`), modification prescription (`prescription_update`).
- **IA** : `ai_analysis_run` (déjà fait), `ai_synthesis_run` (synthèse patient), `ai_liaison_letter_generate`, `ai_reconciliation_run`.
- **Exports** : `export_pdf_liaison`, `export_pdf_bmo`, `export_csv_metrics`, `export_audit_csv` (auto-audité quand un admin télécharge le journal).
- **Admin** : `role_grant`, `role_revoke`, `bdpm_refresh`, `rag_index_rebuild`.

Pour chaque point : action stable (snake_case court), `entityType` standardisé (`patient`, `episode`, `prescription`, `analysis`, `export`, `admin`), `entityId` réel, `payload` minimal sans PII brute (uniquement IDs + métadonnées : type d'export, modèle IA utilisé, durée, taille, motif si fourni).

### Lot B — Export signé inviolable

Nouvelle server fn `exportAuditSigned({ since?, until? })` (admin only) qui :

1. Lit un intervalle d'`audit_log` ordonné par `seq`.
2. Sérialise en JSON canonique (clés triées, séparateurs fixes).
3. Calcule un **hash global** = SHA-256(`first.prev_hash || last.hash || count || since || until`).
4. Renvoie un bundle `{ entries, manifest: { count, since, until, firstHash, lastHash, exportHash, exportedAt, exportedBy } }`.
5. Trace lui-même un événement `audit_export` dans le journal.

UI : bouton "Export signé (JSON)" sur `/admin/audit`, à côté du CSV. Téléchargement `.json` + affichage du `exportHash` pour archivage externe.

### Lot C — Rétention & purge contrôlée

- Ajout d'une colonne `retention_class text NOT NULL DEFAULT 'standard'` (`standard` = 5 ans, `sensitive` = 10 ans, `permanent` = jamais).
- Server fn `getAuditRetentionStats()` (admin) : compte par classe, plus ancienne entrée, volume.
- **Pas de purge automatique en v2** : la suppression casserait la chaîne. À la place, on documente la politique dans `/admin/audit` (panneau "Politique de rétention" texte + lien vers DPO). La purge réelle sera un Lot v3 avec re-chaînage cryptographique (Merkle root archivé).

### Lot D — Vue par entité

- Sur la fiche patient et la fiche épisode, ajout d'un panneau pliable "Journal d'audit (admin)" qui appelle `listAudit({ entityType, entityId })` — visible uniquement si l'utilisateur est admin (hook `useIsAdmin`).
- Affiche les 20 dernières entrées concernant cette entité, lien "Voir tout" vers `/admin/audit?entityType=…&entityId=…` (filtres pré-remplis via search params).

### Lot E — Mise à jour pistes & doc

- Marquer Piste #13 en "Livré v2" dans `ameliorations.tsx`.
- Note : "v3 = purge avec Merkle root archivé + signature externe (timestamping RFC 3161)".

### Détails techniques

- **Helper client** : `src/lib/audit/auditClient.ts` exportant `audit(action, entityType, entityId, payload?)` qui appelle `recordAudit` en *fire-and-forget* (jamais bloquant, jamais throw). Tous les call sites UI passent par ce helper pour garantir l'uniformité et la résilience.
- **Côté server fns** : appel direct à `append_audit_log` via `supabase.rpc` dans le `.handler()` après l'opération métier, en `try/catch` silencieux (l'échec d'audit ne doit jamais annuler une action clinique réussie, mais est loggé console).
- **Validation Zod** : `action` whitelistée via un enum exporté `AuditAction` (centralisé dans `src/lib/audit/actions.ts`) pour éviter les fautes de frappe et faciliter le filtrage UI.
- **Payload PII** : règle stricte — pas de nom patient, pas de contenu de prescription, pas de texte libre IA. Seulement IDs internes et métadonnées techniques.
- **Pas de nouvelle migration de schéma sauf** : ajout de `retention_class` (Lot C), et un index `audit_log(action)` pour les filtres.
- **`/admin/audit`** : ajout des search params (`action`, `entityType`, `entityId`) lus depuis l'URL pour partager des liens filtrés.

### Critères d'acceptation

- Toute action listée Lot A apparaît dans `/admin/audit` ≤ 2 s après exécution.
- L'export signé est rejoué : on recalcule `exportHash` localement (script ou outil tiers) et il correspond au manifest.
- Une tentative `UPDATE` ou `DELETE` sur `audit_log` via l'API (même admin) échoue (déjà bloqué par trigger en v1, à re-vérifier).
- L'échec de la passerelle IA n'empêche pas l'audit des actions déterministes (audit reste opérationnel en mode dégradé).
- Le panneau "Journal d'audit (admin)" n'est jamais visible pour un utilisateur non-admin (vérif côté serveur via `listAudit` qui throw `Forbidden`).

### Hors v2

- Purge avec re-chaînage Merkle.
- Timestamping RFC 3161 / horodatage qualifié eIDAS.
- Diffusion temps réel (websocket) du journal aux admins connectés.
- Anonymisation différée (RGPD droit à l'oubli) — nécessite une stratégie d'effacement compatible chaîne.
