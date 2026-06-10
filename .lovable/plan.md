## Objectif

Après import PDF patient (modal `BulkPatientImportModal`), on ne passe plus par la « Fiche de synthèse patient » : on ouvre directement le dossier patient et la conciliation médicamenteuse complète se lance toute seule.

## Changements

### 1. `src/routes/_authenticated/patients.index.tsx`
- Dans `onCompleted` du `<BulkPatientImportModal>` : remplacer l'ouverture de `SynthesePatientDialog` (`setSyntheseFor(bulkTargetId)`) par une navigation vers `/patients/$patientId` avec un search param `autoConciliate=1`.
- Garder `SynthesePatientDialog` en place (accessible via le bouton « Synthèse patient » du dossier), juste ne plus l'ouvrir auto après l'import.

### 2. `src/routes/_authenticated/patients.$patientId.tsx`
- Déclarer un `validateSearch` (zod) acceptant `autoConciliate: z.coerce.boolean().optional()`.
- Lire `Route.useSearch()` et passer `autoStart={search.autoConciliate === true}` au `<ConciliationCompleteCard />`.
- Optionnel : après déclenchement, nettoyer le search param via `navigate({ search: {} , replace: true })` pour qu'un refresh ne relance pas l'analyse.

### 3. `src/components/patient/ConciliationCompleteCard.tsx`
- Ajouter une prop `autoStart?: boolean`.
- Ajouter un `useEffect` qui, lorsqu'on a `autoStart === true`, que `latest` est `null/undefined` (aucune analyse existante), que `mut.isPending` est faux et qu'on n'a pas déjà déclenché (ref `didAutoStart`), appelle `mut.mutate()` une seule fois.
- Important : attendre que la query `patient-conciliation-complete` ait fini de charger (`isLoading === false`) avant de décider, pour ne pas écraser une analyse existante par un nouveau run.

## Hors-scope

- Pas de modification du flux `BulkPatientImportModal` lui-même (le bouton « Ouvrir la conciliation » du `phase === 'done'` reste tel quel pour le cas import sans `targetPatientId` côté épisode).
- Pas de modification de `analyzePatientConciliationComplete` (déjà branché, on déclenche juste l'existant).
- Pas de migration DB.
