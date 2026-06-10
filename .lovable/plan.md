# Piste #5 — Mesure du temps de conciliation

## Objectif

Instrumenter chaque étape du workflow pour produire des métriques quantitatives :
temps médian par étape, par pharmacien, par niveau P1-P5, par organisation.
Sert d'argument ROI commercial et de base pour publication scientifique.

## Livrables v1

1. Table `conciliation_events` (qui, quand, quoi, combien de temps).
2. Hook React `useConciliationTimer(episodeId, step)` qui pose un événement à
   l'entrée et calcule la durée à la sortie, avec battement de cœur pour ne pas
   compter le temps onglet inactif.
3. Instrumentation des points clés du workflow existant (5 étapes).
4. Page `/conciliation/metriques` (admin + responsable pharmacie) avec :
   temps médian par étape, par utilisateur, distribution P10/P50/P90, volumétrie
   par jour/semaine, comparatif "avec vs sans IA" (présence d'une analyse).
5. Lien depuis la barre admin et passage de la piste #5 en "Livré v1".

Hors v1 : étude clinique avant/après formelle (= protocole métier), export CSV
règlementaire, alerting sur dérive (peut venir plus tard).

## Architecture

```text
UI (épisode/patient)
   │  useConciliationTimer("recueil_atcd")
   ▼
serverFn logConciliationEvent({episodeId, step, durationMs, kind})
   │
   ▼
conciliation_events (org_id auto via patient.organization_id)
   │
   ▼
serverFn getMetrics({orgId?, from, to}) → agrégats SQL
   ▼
/conciliation/metriques (graphiques Recharts)
```

## Schéma BDD (migration unique)

Table `conciliation_events` :

- `id uuid pk`
- `user_id uuid not null` (auth.uid())
- `episode_id uuid null references episodes(id) on delete cascade`
- `patient_id uuid null references patients(id) on delete cascade`
- `organization_id uuid null references organizations(id) on delete set null`
- `step text not null` — enum applicatif : `open_patient`, `open_episode`,
  `recueil_atcd`, `recueil_traitements`, `comparaison`, `analyse_ia`,
  `validation`, `cloture`
- `kind text not null check in ('enter','exit','heartbeat','action')`
- `duration_ms integer null` (rempli côté `exit`)
- `metadata jsonb default '{}'` — par ex. `{niveau_priorite:'P2', has_ia:true, alertes_count:3}`
- `occurred_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`

Index : `(organization_id, occurred_at desc)`, `(user_id, occurred_at desc)`,
`(step, occurred_at desc)`, `(episode_id)`.

GRANT + RLS :
- `GRANT SELECT, INSERT ON public.conciliation_events TO authenticated;`
- `GRANT ALL ON public.conciliation_events TO service_role;`
- RLS on. Policies :
  - INSERT : `auth.uid() = user_id` (chacun écrit ses propres événements).
  - SELECT : `auth.uid() = user_id` OR `has_role(auth.uid(),'admin')` OR
    `is_org_member(organization_id)` (les membres de l'org voient les
    événements de l'org pour les agrégats).

Vue matérialisée `conciliation_event_durations` non nécessaire en v1 — les
agrégats restent rapides sur cette table tant qu'on a les bons index.

## Serveur (`src/lib/metrics/`)

1. **`events.functions.ts`** — `createServerFn` + `requireSupabaseAuth` :
   - `logConciliationEvent({ episodeId?, patientId?, step, kind, durationMs?, metadata? })`
     → insert. Résout `organization_id` depuis le patient si fourni.
   - `getMetrics({ from, to, organizationId? })` → renvoie :
     - `byStep`: `{step, count, p10, p50, p90, totalMs}[]`
     - `byUser`: `{user_id, episodes, totalMs, medianStepMs}[]`
     - `volumeByDay`: `{day, episodes, validations}[]`
     - `iaImpact`: `{withIa: {count, medianMs}, withoutIa: {count, medianMs}}`
   - Calcul SQL via `percentile_cont` regroupé par `step`. Filtrage RLS gère
     déjà le cloisonnement org/admin.
2. **`getMyOrg.server.ts`** helper réutilisé (récupère la première
   organisation du user pour scoper par défaut).

## Client (hook + UI)

1. **`src/hooks/useConciliationTimer.ts`** :
   - À l'entrée : appel `logConciliationEvent({step, kind:'enter'})`, démarre
     un `performance.now()`.
   - Heartbeat toutes les 30 s tant que `document.visibilityState==='visible'`
     ET activité (mousemove/keydown < 60 s) — sinon stoppe le compteur local.
   - À la sortie (cleanup `useEffect` ou `beforeunload`) : envoie `exit` avec
     `durationMs` cumulé en envoyant via `navigator.sendBeacon` quand
     possible (fallback fetch keepalive).
   - Coalesce : si une étape dure < 2 s, on n'enregistre pas (clic accidentel).
2. **Points d'instrumentation** :
   - `patients.$patientId.tsx` → `useConciliationTimer({step:'open_patient', patientId})`
   - `episodes.$episodeId.tsx` → `useConciliationTimer({step:'open_episode', episodeId})`
   - Onglet "Traitements habituels" / "Antécédents" du dossier
     (BulkPatientImportModal & co) → `step:'recueil_atcd'`,
     `step:'recueil_traitements'`
   - Tout composant de comparaison conciliation → `step:'comparaison'`
   - Déclenchement d'une analyse IA (`analyzePatientConciliationComplete`)
     → `kind:'action'`, `step:'analyse_ia'`, metadata `{model, latencyMs}`
   - Validation finale (`conciliation_validations.insert`) →
     `kind:'action'`, `step:'validation'`, metadata
     `{niveau, alertes_count, has_ia}`

## UI dashboard

Nouvelle route `/_authenticated/conciliation.metriques.tsx` (gated admin OU
membre d'une org) :

- Filtres : période (7/30/90 jours, custom), organisation (si plusieurs),
  utilisateur (optionnel).
- Carte "Temps médian d'une conciliation complète" (somme des médianes par
  étape).
- Bar chart "Temps médian par étape" (Recharts).
- Tableau "Par pharmacien" : N épisodes, médiane, p90.
- Line chart "Volume hebdomadaire" : épisodes ouverts vs validés.
- Carte "Impact IA" : médiane avec/sans analyse IA, % de gain.
- Bandeau d'aide : "Les durées excluent les périodes d'inactivité (onglet en
  arrière-plan ou pas d'interaction > 60 s)."

Lien dans `admin.tsx` à côté de "Import réel".

Mise à jour `ameliorations.tsx` : `statut: "Livré v1"` pour la piste #5.

## Sécurité / vie privée

- Aucune donnée patient sensible dans `metadata` (seulement niveaux,
  compteurs, modèle IA).
- RLS : un pharmacien voit ses propres événements + ceux de son organisation
  pour permettre les agrégats d'équipe ; il ne peut pas voir d'autres orgs.
- Pas de tracking comportemental hors workflow conciliation (pas de heartmap,
  pas de tracking de mouvements souris en clair).

## Fichiers touchés

- Nouvelle migration : `conciliation_events` + RLS + GRANT + index.
- Nouveaux : `src/lib/metrics/events.functions.ts`,
  `src/hooks/useConciliationTimer.ts`,
  `src/routes/_authenticated/conciliation.metriques.tsx`.
- Édités : `src/routes/_authenticated/patients.$patientId.tsx`,
  `src/routes/_authenticated/episodes.$episodeId.tsx`,
  `src/components/conciliation/BulkPatientImportModal.tsx` (instrumentation),
  `src/lib/conciliation/analyze.functions.ts` /
  `analyzePatientConciliationComplete.functions.ts` (log `analyse_ia`),
  composant de validation (log `validation`),
  `src/routes/_authenticated/admin.tsx` (nav),
  `src/routes/_authenticated/ameliorations.tsx` (statut),
  `src/integrations/supabase/types.ts` (auto-régénéré après migration).
