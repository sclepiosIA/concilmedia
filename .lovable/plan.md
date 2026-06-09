
## Objectif

Chaque prescription hospitalière reçoit un statut de concordance affiché sous forme de **fond de ligne teinté + badge cliquable** :

| Couleur | Sens |
|---|---|
| 🟢 Vert | Identique à l'ordonnance initiale (DCI, dose, posologie) — aucune alerte |
| 🟡 Jaune | Différent mais adaptation logique/attendue (ex. switch IV→PO, ajustement rénal) |
| 🟠 Orange | Différent et probablement non souhaité (oubli, divergence non justifiée) |
| 🔴 Rouge | Erreur ou hors-AMM (surdosage, contre-indication, voie inadaptée) |

## Architecture — moteur hybride

### 1. Couche déterministe (instantanée, client)
Nouveau fichier `src/lib/conciliation/prescriptionMatch.ts` (pur, testable) :
- `matchPrescription(hosp, domicileList)` retourne `{ status, reason, matchedDomicile }`
- Règles immédiates :
  - **VERT** : DCI normalisée identique + même dosage + même posologie M/Mi/S/Co (ou même `posologie` parsée) + même voie
  - **ROUGE** : dose journalière > seuil AMM connu (table simple par DCI courantes — paracétamol 4g, ibuprofène 1.2g, etc.) ou voie incohérente
  - **ORANGE** : DCI présente au domicile mais dose/posologie diverge sans motif détecté
  - **JAUNE** : motif déterministe détecté (ex. forme IV vs PO du même DCI, ou ajout d'un médicament d'une classe déjà présente)
  - **GRIS / non évalué** : pas de domicile connu → on déclenche l'IA
- Sortie : statut + raison courte affichée dans le tooltip

### 2. Couche IA (Lovable AI, asynchrone, server)
Nouveau server function `src/lib/conciliation/matchPrescriptionAI.functions.ts` :
- Input : la prescription hospitalière + liste des traitements habituels du patient + allergies + comorbidités (contexte clinique)
- Modèle : `google/gemini-3-flash-preview` via `ai-gateway.server`, sortie structurée Zod `{ status: "vert"|"jaune"|"orange"|"rouge", reason: string, recommandation?: string }`
- Appelée uniquement quand le déterministe renvoie **JAUNE** ou **ORANGE** (cas ambigus) — vert/rouge restent côté client pour la réactivité

### 3. Persistance
Nouvelles colonnes sur `prescriptions_hospitalieres` :
- `match_status` (text: vert/jaune/orange/rouge/en_cours)
- `match_reason` (text)
- `match_source` (text: deterministe/ia)
- `match_analyzed_at` (timestamptz)

Migration Supabase pour les ajouter (sans toucher aux policies existantes).

### 4. Déclenchement temps réel
Dans `PrescriptionsHospitalieresColumn.tsx` et `PrescriptionHospitaliereUploader.tsx` :
- À chaque **insertion** (manuelle + import OCR) ou **update** d'une prescription :
  1. Exécute `matchPrescription()` côté client → statut immédiat
  2. Persiste `match_status/reason/source=deterministe`
  3. Si statut ∈ {jaune, orange} → appel `matchPrescriptionAI` en arrière-plan (mutation react-query, `match_source=ia` au retour)
- Recalcul si les traitements domicile changent : invalidation de la query + ré-exécution batchée via un bouton "Réanalyser" (évite spam IA)

## UI

Dans `PrescriptionsHospitalieresColumn.tsx` :
- Chaque ligne reçoit un fond teinté discret selon `match_status` :
  - vert : `bg-green-50 dark:bg-green-950/30 border-l-2 border-green-500`
  - jaune : `bg-yellow-50 ... border-yellow-500`
  - orange : `bg-orange-50 ... border-orange-500`
  - rouge : `bg-red-50 ... border-red-500`
  - en_cours : `bg-muted/20` + petit Loader2 spin
- Nouveau composant `MatchBadge` à gauche de la ligne :
  - Icône (CheckCircle2 / AlertCircle / AlertTriangle / XCircle / Loader2)
  - Tooltip détaillant `match_reason` + indicateur source (déterministe/IA)
  - Click → popover avec recommandation IA si disponible

Légende repliable en haut de la colonne (4 puces couleur + libellé).

## Fichiers touchés

**Créés :**
- `src/lib/conciliation/prescriptionMatch.ts` — règles déterministes + table seuils AMM
- `src/lib/conciliation/matchPrescriptionAI.functions.ts` — server function IA
- `src/components/conciliation/MatchStatusBadge.tsx` — badge + tooltip + popover
- Migration : colonnes `match_*` sur `prescriptions_hospitalieres`

**Modifiés :**
- `src/components/conciliation/PrescriptionsHospitalieresColumn.tsx` — fond ligne, badge, hook de matching à l'insert/update, légende
- `src/components/conciliation/PrescriptionHospitaliereUploader.tsx` — déclenchement du matching après import OCR
- `src/integrations/supabase/types.ts` — régénéré après migration

## Points de validation

- Aucune erreur RLS (les colonnes ajoutées héritent des policies existantes)
- Pas d'appel IA si pas de traitement domicile (statut "non évalué" gris)
- Pas de spam IA : 1 appel par prescription ambiguë, résultat persisté
- Le matching s'exécute aussi pour les prescriptions importées en masse via OCR
