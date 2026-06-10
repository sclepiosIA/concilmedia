## Objectif

Aujourd'hui, dans la conciliation, beaucoup de couples ville ↔ hôpital sont classés en `omission` ou `ajout_non_justifie` alors qu'il s'agit en réalité de **switchs thérapeutiques de prise en charge hospitalière** (changement de voie, relais, équivalence de classe). Exemples vus sur la capture :

- Rivaroxaban PO (ville) → HNF IV / HBPM (hôpital) = switch anticoagulant oral → parentéral
- Metformine PO (ville) → Insuline rapide SC (hôpital) = switch ADO → insuline en aigu
- IEC/ARA2 PO suspendus → équivalent IV ou suspension transitoire
- Bêtabloquant PO → forme IV (esmolol, etc.)

Le type `"switch"` existe déjà dans le schéma JSON et dans l'UI, mais :
1. le **fallback déterministe** (`buildFastConciliationPayload`) ne le produit jamais — il classe tout en omission/ajout.
2. le **prompt IA** mentionne le switch en une ligne mais ne donne pas les règles d'appariement par classe → l'IA continue de couper en omission + ajout.
3. la conciliation locale (`useMedicationReconciliation`) ne connaît que `omission | ajout | modification_dose | modification_freq | duplication` côté base — pas de type `switch`.

## Plan

### 1. Renforcer le prompt IA (`src/lib/admin/defaultPrompts.server.ts`)

Dans `analyze_patient_complete`, ajouter une règle dédiée « switch hospitalier » avec une table d'équivalences cliniques que l'IA doit appliquer **avant** de conclure à une omission ou un ajout :

- Anticoagulants : AOD (rivaroxaban, apixaban, dabigatran, edoxaban) / AVK ↔ HNF IV / HBPM SC / fondaparinux
- Antidiabétiques : metformine + ADO + insulines lentes ↔ insuline rapide SC protocole / insuline IVSE
- Antihypertenseurs PO ↔ nicardipine IV, urapidil IV, labétalol IV
- Bêtabloquants PO ↔ esmolol / labétalol IV
- Corticoïdes PO ↔ méthylprednisolone IV
- Antalgiques PO ↔ paracétamol IV, morphine IV/PCA
- IPP PO ↔ IPP IV
- Toute molécule PO ↔ même DCI en IV/SC = switch de voie (`modification_posologie` n'est pas adapté)

Règle ajoutée : « Si un médicament habituel de classe X est absent à l'hôpital MAIS qu'un médicament hospitalier de la même classe thérapeutique ou couvrant la même indication est présent, créer UNE seule ligne `type:"switch"` (medicament_ville rempli ET medicament_hopital rempli), pas une omission + un ajout. »

### 2. Détection dans le fallback rapide (`analyzePatientConciliationComplete.functions.ts`)

Ajouter une petite table de classes ATC / mots-clés (anticoagulant, antidiabétique, antihypertenseur, bêtabloquant, IPP, corticoïde, antalgique) et, dans `buildFastConciliationPayload` :

1. Avant de produire les omissions/ajouts, apparier ville ↔ hôpital par classe.
2. Si un traitement ville sans match DCI a un équivalent de classe à l'hôpital (et que celui-ci n'a pas non plus de match DCI ville), émettre une ligne `type:"switch"` avec :
   - `medicament_ville` et `medicament_hopital` renseignés
   - `severite:"moderee"` (ou `majeure` pour anticoagulants/insulines)
   - `recommandation` = « Tracer le switch X→Y, prévoir le relais à la sortie »
3. Retirer ces deux molécules des listes d'omissions et d'ajouts pour éviter le double comptage.

### 3. UI (`ConciliationCompleteCard.tsx`, `ClinicalAlertsPanel.tsx`)

- Le label `"Switch"` est déjà présent ; ajouter une couleur distincte (badge bleu/violet) pour le différencier visuellement de l'omission (jaune/orange) et de l'ajout (gris).
- Dans la légende et le compteur en haut de section, ajouter un compteur « Switch » à côté de Omissions / Ajouts.

### 4. (Hors périmètre, pour information)

La table `conciliation_medicaments` (`type_divergence`) utilisée par le hook `useMedicationReconciliation` n'a pas de valeur `switch`. Comme le composant affecté par la demande utilisateur est `ConciliationCompleteCard` (analyse IA, payload JSON), **aucune migration de schéma n'est nécessaire** pour ce changement. Si tu souhaites aussi propager le type `switch` dans la conciliation déterministe locale (colonne ville/hôpital), je le ferai dans un second temps avec une migration dédiée.

## Fichiers modifiés

- `src/lib/admin/defaultPrompts.server.ts` — règle switch + table d'équivalences
- `src/lib/conciliation/analyzePatientConciliationComplete.functions.ts` — appariement par classe dans le fallback
- `src/components/patient/ConciliationCompleteCard.tsx` — badge couleur + compteur switch
- `src/components/conciliation/ClinicalAlertsPanel.tsx` — badge couleur switch

## Validation

Relancer l'analyse IA sur le dossier Garcia Michel : les lignes Rivaroxaban / Metformine / etc. doivent apparaître comme `Switch` (ville=Rivaroxaban, hôpital=HNF IV) au lieu de deux lignes omission + ajout.
