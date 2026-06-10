# Audit Concilmed — état et plan d'amélioration

Audit réalisé sur le code, la base Supabase (linter) et les patterns TanStack. 17 points identifiés, regroupés par sévérité. Le plan ci-dessous propose une remise à niveau en 4 lots.

---

## 🔴 Critique — à corriger en priorité

### 1. RLS désactivée de fait sur les patients
Une migration a remplacé la politique `own patients` par `USING (true)` et réécrit `owns_patient()` pour qu'elle renvoie `true` dès que l'utilisateur est connecté. **Conséquence : tout pharmacien connecté peut lire/modifier/supprimer les patients de tous les autres.** Toutes les tables filles (allergies, traitements, épisodes, conciliations…) héritent du problème car elles délèguent à `owns_patient()`.

**Fix** : restaurer `USING (auth.uid() = created_by)` sur `patients` et la version filtrante de `owns_patient()`. Si le partage entre pharmaciens est souhaité, modéliser une table `patient_shares` explicite.

### 2. Triage : requête `risk_scores` non filtrée
`src/hooks/usePatientsTriage.ts:41` charge **tous** les scores de risque visibles (donc, vu le point 1, ceux de tous les patients). Fix : ajouter `.in("episode_id", episodeIds)` après avoir récupéré les épisodes des patients ciblés.

### 3. Fonctions SECURITY DEFINER exposées
Le linter Supabase signale 5 warnings sur `has_role`, `owns_patient`, `owns_episode`, `ai_provider_set_key`, `ai_provider_decrypt_key` : exécutables par `anon` ou `authenticated`. Revoke `EXECUTE` pour `anon` partout, et pour `authenticated` sur les fonctions `ai_provider_*` (réservées au service role).

---

## 🟠 Haut

### 4. `getGreeting` server function publique
`src/lib/api/example.functions.ts` est un scaffold sans `requireSupabaseAuth`, callable publiquement, et qui lit `process.env`. À supprimer (code mort).

### 5. Garde admin côté client uniquement
`src/routes/_authenticated/admin.tsx` : le `beforeLoad` appelle `isAdmin()` qui renvoie `{ isAdmin: false }` au lieu de `throw redirect(...)`. Les serverFn enfants sont protégées par `assertAdmin`, mais la coquille UI fuit. Fix : `throw redirect({ to: '/' })` si non-admin.

### 6. `deleteConciliationValidation` sans contrôle d'ownership
`src/lib/conciliation/validateConciliation.functions.ts:109` supprime sur `analysisId` sans vérifier `validated_by = userId`. Ajouter `.eq("validated_by", userId)` en défense en profondeur.

### 7. Erreurs serveur silencieusement avalées
Plusieurs `console.warn` sur des opérations critiques (archivage patient après validation, upload de documents sources, persistance d'évaluations cohorte) : `validateConciliation.functions.ts:87`, `bulkImport.functions.ts:402`, `analyzePatientConciliationComplete.functions.ts:321/517`, `analyze.functions.ts:194/211`, `evaluateCohort.functions.ts:271`. Fix : remonter via toast + logger structuré.

### 8. Fonctions de seed démo dans le bundle client
`seedDemoJeanMartin.ts`, `seedDemoJeanPierreMoreau.ts`, `seedDemoSophieLemoine.ts` importent le client supabase navigateur et sont appelables depuis la console. Fix : passer derrière un `createServerFn` admin-only ou gate `import.meta.env.DEV`.

---

## 🟠 Moyen

### 9. Route `/` publique qui interroge Supabase
`src/routes/index.tsx` est `ssr: false` et appelle `supabase.from("patients")` après un `getUser()` manuel — pattern fragile qui contourne la couche `_authenticated`. Fix : laisser `/` minimal (landing/redirect) et garder le dashboard sous `/_authenticated/dashboard`.

### 10. Aucun `errorComponent` / `notFoundComponent` sur les routes enfants
Seul `__root.tsx` en a. Les routes dynamiques `patients.$patientId`, `episodes.$episodeId`, `admin.ai.tasks.$slug` doivent en déclarer (avec `useRouter().invalidate()` + `reset()` dans le retry).

### 11. Composants surdimensionnés
- `ClinicalAlertsPanel.tsx` (824 l.)
- `PrescriptionsHospitalieresColumn.tsx` (644 l.)
- `ConciliationCompleteCard.tsx` (635 l.)
- `patients.index.tsx` (553 l., 10+ états)

Données + logique + rendu mélangés → re-renders inutiles, tests impossibles. Fix : extraire sous-composants par catégorie d'alerte, déplacer le fetch dans des hooks, `React.memo` sur les sous-arbres stables.

### 12. `staleTime` absent sur la plupart des `useQuery`
`patients.index.tsx`, `patients.$patientId.tsx`, `dashboard.tsx`, `episodes.$episodeId.tsx` : refetch agressif à chaque navigation → flicker visible et charge Supabase superflue. Fix : `staleTime: 30_000` minimum.

### 13. `usePatientsTriage` : 8 requêtes parallèles à chaque montage
Mitigé par `staleTime: 5min` mais cher au premier load. Fix possible : RPC/vue Postgres unique qui renvoie toutes les colonnes de triage en un appel.

---

## 🟡 Bas

### 14. Accessibilité quasi nulle
Aucun `aria-label` hors bouton LogOut, badges de gravité reposant uniquement sur la couleur (WCAG 1.4.1 / 4.1.2 KO). Fix : `aria-label` sur boutons icônes, `role="status"` sur badges de triage, labels associés aux inputs.

### 15. Code mort
`src/lib/api/example.functions.ts` jamais importé.

### 16. Aucun test, aucune observabilité
Aucun `.test.ts`, pas de Vitest/Playwright configuré, pas de Sentry. Pour une appli santé c'est un risque opérationnel. Fix : Vitest sur la logique pure (`triageScale.ts`, `riskScore.ts`, `deterministicAlerts.ts`), Playwright sur les parcours critiques.

### 17. Politique RLS permissive (linter)
Le linter signale au moins une policy en `USING (true)` sur opération mutative — corrélée au point 1.

---

## Plan de correction proposé (4 lots)

**Lot 1 — Sécurité (bloquant)**
- Restaurer l'isolation RLS `patients` + `owns_patient()` (point 1)
- Scoper `risk_scores` par épisode (point 2)
- Revoke EXECUTE sur les fonctions DEFINER exposées (point 3)
- Supprimer `example.functions.ts` (points 4 + 15)
- `throw redirect` dans le gate admin (point 5)
- Ownership check sur `deleteConciliationValidation` (point 6)
- Seeds démo derrière un serverFn admin (point 8)

**Lot 2 — Robustesse**
- Remplacer `console.warn` critiques par toast + throw (point 7)
- Ajouter `errorComponent`/`notFoundComponent` sur routes dynamiques (point 10)
- Ajouter `staleTime` sur les `useQuery` de route (point 12)

**Lot 3 — Architecture & perf**
- Découper `ClinicalAlertsPanel`, `PrescriptionsHospitalieresColumn`, `ConciliationCompleteCard`, `patients.index` (point 11)
- Vue/RPC unique pour `usePatientsTriage` (point 13)

**Lot 4 — Qualité long terme**
- Accessibilité : `aria-label`, `role="status"`, labels (point 14)
- Vitest sur logique pure + Playwright sur parcours critiques (point 16)

Dis-moi par quel lot tu veux commencer (par défaut **Lot 1** — la fuite RLS est le risque le plus grave).
