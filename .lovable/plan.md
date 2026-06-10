## Piste #8 v1 — Module pharmacien conciliateur multi-sites

L'app a déjà le socle multi-tenant (Piste #4) : tables `organizations`, `organization_members` (rôle `admin|pharmacien|observateur`), helpers RLS `is_org_member/is_org_admin`, et `patients.organization_id`. Il manque la notion d'équipe/service, l'assignation d'un dossier à un pharmacien, le transfert avec historique, et une vue superviseur.

### 1. Schéma BDD (1 migration)

**Étendre `organization_members`** :
- `service text NULL` — service hospitalier (« Gériatrie », « Cardio », « Tous »…).
- `display_name text NULL` — nom affichable dans les listes de transfert (fallback : email).

**Étendre `patients`** (additif, rétro-compatible) :
- `assigned_to uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL` — pharmacien titulaire du dossier.
- `service text NULL` — service du séjour (utilisé pour filtrer la file).
- `workflow_status text NOT NULL DEFAULT 'a_faire'` CHECK in `('a_faire','en_cours','en_attente_validation','valide','clos')`.
- Index `(organization_id, workflow_status, assigned_to)`.

**Nouvelle table `conciliation_transfers`** : historique des transferts/assignations.
- `id, patient_id, organization_id, from_user_id, to_user_id, motif text, created_at, created_by`.
- RLS : SELECT/INSERT pour membres de l'org (`is_org_member`).
- GRANT `SELECT, INSERT` à `authenticated`, `ALL` à `service_role`.

**RLS patients** : déjà scopé orga, on garde. Pas de policy supplémentaire — `assigned_to` est un attribut, pas une restriction d'accès (un superviseur doit pouvoir réassigner).

### 2. Server fns (`src/lib/team/`)

- `listTeam.functions.ts` → `listOrgMembers({ organizationId })` : retourne `{ user_id, role, service, display_name }[]` pour peupler les selects de transfert.
- `assignPatient.functions.ts` :
  - `assignPatient({ patientId, toUserId, motif? })` : middleware auth, vérifie `is_org_member`, met à jour `patients.assigned_to`, insère un `conciliation_transfers`. Idempotent.
  - `setWorkflowStatus({ patientId, status })` : transitions contrôlées (`a_faire→en_cours→en_attente_validation→valide`; `clos` accessible depuis tout état).
- `listTransfers.functions.ts` → historique d'un patient.
- `updateMemberService.functions.ts` → admin org seulement (`is_org_admin`), modifie `service` / `display_name`.

Toutes utilisent `requireSupabaseAuth` + vérification d'appartenance org.

### 3. UI

**Refonte `patients.index.tsx`** : filtres barres latérales/haut :
- Organisation (déjà), **Service** (distinct sur memberships ou patients), **Statut workflow** (badges), **Affectation** (Mes dossiers / Non assignés / Tous).
- Colonne « Assigné à » + badge statut + bouton « Prendre en charge » (raccourci `assignPatient` vers soi-même si non assigné).

**Patient detail (`patients.$patientId.tsx`)** :
- Nouveau bloc « Affectation » : sélecteur statut, sélecteur pharmacien (alimenté par `listOrgMembers`), zone motif, bouton « Transférer ».
- Timeline transferts via `listTransfers`.

**Nouvelle route `_authenticated/conciliation.supervision.tsx`** :
- Sélecteur orga.
- Vue Kanban 4 colonnes (`à_faire`, `en_cours`, `en_attente_validation`, `valide`), cartes patient avec service + pharmacien + âge dossier.
- KPIs en haut : nb dossiers par statut, par pharmacien, > 48 h sans mouvement.
- Drag&drop hors v1 (boutons « passer à l'étape suivante » suffisent).

**Admin équipe `admin.team.tsx`** (visible si `is_org_admin`) :
- Table membres de l'org sélectionnée : email/nom, rôle, service éditable inline, bouton retirer.
- (Invitation par email = hors v1, on assume l'inscription manuelle puis ajout par admin via `organization_members`).

Liens latéraux ajoutés dans `admin.tsx` (Équipe) et dans la nav principale (Supervision).

### 4. Statut

`ameliorations.tsx` : Piste #8 → `statut: "Livré v1"`.

### Fichiers

```text
supabase/migrations/<ts>_piste8_team_workflow.sql                NEW
src/lib/team/listTeam.functions.ts                                NEW
src/lib/team/assignPatient.functions.ts                           NEW
src/lib/team/listTransfers.functions.ts                           NEW
src/lib/team/updateMemberService.functions.ts                     NEW
src/components/team/AssignmentPanel.tsx                           NEW (bloc patient detail)
src/components/team/TransferHistory.tsx                           NEW
src/components/team/WorkflowStatusBadge.tsx                       NEW
src/routes/_authenticated/conciliation.supervision.tsx            NEW
src/routes/_authenticated/admin.team.tsx                          NEW
src/routes/_authenticated/patients.index.tsx                      EDIT (filtres + colonne)
src/routes/_authenticated/patients.$patientId.tsx                 EDIT (intègre AssignmentPanel)
src/routes/_authenticated/admin.tsx                               EDIT (lien Équipe)
src/routes/_authenticated/ameliorations.tsx                       EDIT (statut)
src/integrations/supabase/types.ts                                AUTO (régénéré)
```

### Hors-périmètre v1 (v2 potentielle)

- Invitations par email + onboarding pharmacien (nécessite Edge function + templates).
- Drag&drop Kanban.
- Notifications (toast / email) sur transfert reçu.
- Multi-organisation GHT « cross-org » (un dossier visible par plusieurs orgs) — nécessite refonte RLS.
- Statistiques superviseur historisées (file d'attente moyenne, SLA).

### Risques / mitigations

- **Régression RLS patients** : la migration n'ajoute que des colonnes, ne touche pas aux policies existantes.
- **Cohérence `workflow_status` vs `conciliation_validations`** : le statut workflow est un *flag UI*, indépendant de la table validations. La transition `en_attente_validation→valide` est purement déclarative ; la validation pharmaceutique réelle reste dans `conciliation_validations`.
- **Patients legacy sans `organization_id`** : `assigned_to` reste possible mais le filtre orga ne les voit pas ; on les expose dans une section « Démos / non rattachés ».

À ta validation, je passe en build.
