
# Plan — Refonte du tableau de bord

## Problème identifié : header absent

Le lien **"Tableau de bord"** de la barre de navigation pointe vers `/` (fichier `src/routes/index.tsx`), qui est en dehors du layout `_authenticated`. Résultat : on tombe sur une page sans header ni navigation. Le vrai dashboard riche (`/_authenticated/dashboard`) n'est en pratique jamais affiché.

### Correctif
1. Modifier le lien "Tableau de bord" dans `src/routes/_authenticated/route.tsx` pour pointer vers `/dashboard`.
2. Dans `src/routes/index.tsx`, rediriger l'utilisateur connecté vers `/dashboard` via `beforeLoad`. Les visiteurs non connectés continuent à voir `/auth` (déjà géré).
3. Conséquence : le header sticky `_authenticated` est conservé sur le tableau de bord.

## Refonte du dashboard (`/_authenticated/dashboard`)

Le dashboard actuel est fonctionnel mais date d'avant les pistes #15 / #16 / #17. Il manque les nouvelles dimensions (tensions ANSM, IV→PO, médico-éco) et plusieurs raffinements UX.

### 1. KPIs (ligne supérieure)
Passer de 4 à 8 KPIs en 2 lignes, avec tendance vs période précédente (flèche ↑↓ + pourcentage) :
- Patients actifs
- Conciliations réalisées (période)
- Divergences critiques/majeures
- Taux de validation pharmacien
- **Patients touchés par une rupture ANSM** (nouveau)
- **Candidats IV→PO identifiés** (nouveau)
- **Économies génériques potentielles €/jour** (nouveau, somme cohorte)
- Temps moyen de conciliation (h)

Chaque KPI : icône domaine, valeur, mini-trend (sparkline) sur 14 j, badge delta.

### 2. Filtres (inchangés mais améliorés)
- Période, service, statut divergence (déjà présents).
- Ajout d'un préréglage rapide : *Aujourd'hui / 7 j / 30 j / 90 j*.
- Bouton "Réinitialiser".

### 3. Graphiques
- **Activité quotidienne** : conserver, ajouter ligne "alertes critiques".
- **Répartition divergences** : conserver (pie).
- **Répartition risques** : conserver (pie).
- **Nouveau bloc Médico-économie** : barres horizontales "Top 5 substitutions génériques" (économie €/j).
- **Nouveau bloc Tensions/ruptures** : liste compacte des médicaments en rupture qui concernent des patients actifs, avec lien vers le patient.

### 4. File priorisée (existante)
- Garder, ajouter une badge "Rupture" / "IV→PO" / "€" quand le patient est concerné.
- Pagination simple (10 / page) au lieu de limit hard-codée.

### 5. Hygiène design
- Remplacer les couleurs hex en dur (`#ef4444`, `#3b82f6`, etc.) par les tokens sémantiques de `src/styles.css` (`--destructive`, `--primary`, `--warning`, etc.) via variables CSS lues côté JS.
- Skeletons de chargement (utiliser `Skeleton` shadcn) au lieu de KPIs à 0 pendant le fetch.
- Empty states avec CTA explicite ("Importer une ordonnance", "Générer cohorte synthétique").
- Bouton "Cohorte synthétique" déplacé dans un menu "Actions" pour désencombrer.

### 6. Quick actions (nouveau)
Petit panneau d'accès rapide (en haut à droite ou en bas) :
- Nouveau patient → `/patients`
- Importer ordonnance → bouton qui ouvre l'uploader
- Voir supervision → `/conciliation/supervision`
- Banc d'évaluation → `/evaluation`

## Détails techniques

### Fichiers à modifier
- `src/routes/_authenticated/route.tsx` : `to="/"` → `to="/dashboard"`.
- `src/routes/index.tsx` : `beforeLoad` qui vérifie la session et `throw redirect({ to: "/dashboard" })` si connecté ; sinon laisse la page actuelle (landing).
- `src/routes/_authenticated/dashboard.tsx` : refonte progressive (KPIs, trends, blocs).

### Fichiers à créer
- `src/components/dashboard/KpiCard.tsx` — carte KPI avec sparkline + delta.
- `src/components/dashboard/ShortagesPatientsCard.tsx` — patients impactés par rupture.
- `src/components/dashboard/EconomicsTopCard.tsx` — top substitutions génériques.
- `src/components/dashboard/QuickActions.tsx`.
- `src/lib/dashboard/aggregations.functions.ts` (optionnel) — server fns pour précalculer côté DB (économies cohorte, intersections rupture↔patient) et éviter N requêtes client.

### Requêtes nouvelles
- Jointure `drug_shortages` × traitements actifs des patients pour compter les patients impactés.
- Vue `v_drug_cheapest_generic` × prescriptions actives pour économies estimées.
- Pour les sparklines : un seul fetch agrégé par jour sur 14 j (groupage côté JS, comme déjà fait).

## Hors scope v1
- Export PDF du dashboard.
- Drill-down interactif sur les graphiques (clic → liste filtrée).
- Personnalisation utilisateur (épingler des cartes, réordonner).
- Comparaison multi-services côte à côte.

## Critères d'acceptation
- Cliquer "Tableau de bord" affiche le header + la nav + le dashboard riche.
- Visiteur non connecté arrive sur `/auth` ; visiteur connecté qui tape `/` est redirigé sur `/dashboard`.
- 8 KPIs visibles avec tendance, dont les 3 nouveaux axes (ruptures / IV→PO / éco).
- Skeletons pendant le chargement, empty states avec CTA, plus aucun hex en dur.
- Bloc "Patients impactés par rupture" et "Top économies génériques" fonctionnels avec données réelles.

## ✅ Finalisation
- KPIs : sparkline 14j + delta période vs période précédente (Conciliations, Critiques) avec couleur "bon/mauvais" sémantique.
- Couleurs : tous les hex remplacés par `--chart-*`, `--destructive`, `--primary` via `useChartColors`.
- File priorisée : pagination 10/page.
- Bouton "Cohorte synthétique" déplacé dans menu **Actions** (avec accès Import BDPM).
