# Import CSV / XLSX de patients dans une cohorte

## Objectif
Dans l'onglet **1. Import cohorte** du banc d'essai, ajouter à côté de l'upload PDF un second uploader pour charger **un fichier CSV ou Excel listant tous les patients** d'un seul coup. Chaque ligne crée un patient rattaché à la cohorte active (sans documents — les PDF restent gérés par l'uploader existant).

## Format attendu du fichier
Colonnes reconnues (insensibles à la casse / accents, ordre libre) :

| Colonne | Obligatoire | Notes |
|---|---|---|
| `nom` | oui | string |
| `prenom` | oui | string |
| `date_naissance` | non | `YYYY-MM-DD` ou `DD/MM/YYYY` |
| `sexe` | non | `M` / `F` |
| `poids_kg` | non | nombre |
| `taille_cm` | non | nombre |
| `nir` | non | string |
| `notes` | non | string libre |

Un lien "Télécharger un modèle CSV" sera proposé sous l'uploader.

## UI (CohortImportTab)
Nouvelle `Card` placée entre "Cohortes existantes" et "Upload de fichiers patients" :
- Zone de drop / sélection : `.csv, .xlsx, .xls`
- Désactivée si pas de cohorte active
- Après parsing : prévisualisation des 5 premières lignes + nombre total détecté + lignes en erreur (nom/prénom manquants)
- Bouton **"Importer N patients"** qui appelle le serverFn
- Toast de succès `N patients créés` + invalidation `["cohortPatients", cohortId]`

## Implémentation technique

### Dépendances
- `xlsx` (SheetJS) pour lire `.xlsx` / `.xls` et CSV avec la même API (parse côté **client** uniquement, pas dans le worker server).

### Parsing client
Nouveau composant `src/components/cohort/CohortPatientsRosterUploader.tsx` :
- lit le fichier via `FileReader`, parse avec `XLSX.read` → `sheet_to_json`
- normalise les headers (lowercase, sans accents)
- valide chaque ligne avec un schéma Zod (`nom` + `prenom` requis)
- normalise `date_naissance` (FR → ISO), `sexe` (`m`/`f` → `M`/`F`)
- affiche preview + erreurs, puis appelle la mutation

### ServerFn
Nouveau fichier `src/lib/cohort/importPatientsRoster.functions.ts` :

```ts
export const importPatientsRoster = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({
    cohortId: z.string().uuid(),
    patients: z.array(z.object({
      nom: z.string().trim().min(1).max(120),
      prenom: z.string().trim().min(1).max(120),
      date_naissance: z.string().date().nullable().optional(),
      sexe: z.enum(["M","F"]).nullable().optional(),
      poids_kg: z.number().positive().max(400).nullable().optional(),
      taille_cm: z.number().positive().max(260).nullable().optional(),
      nir: z.string().max(20).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
    })).min(1).max(2000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // vérifie cohorte appartient au user, puis insert bulk
    // récupère cohort.tag pour remplir cohort_tag
    // is_synthetic: false (vrais patients d'évaluation)
  });
```
Retour : `{ inserted: number }`.

### Aucune migration nécessaire
La table `patients` a déjà toutes les colonnes nécessaires (`cohort_id`, `cohort_tag`, `archived`, etc.).

## Fichiers touchés
- **Créé** `src/components/cohort/CohortPatientsRosterUploader.tsx`
- **Créé** `src/lib/cohort/importPatientsRoster.functions.ts`
- **Édité** `src/components/cohort/CohortImportTab.tsx` (intégration de la nouvelle Card)
- **Dépendance** : `bun add xlsx`

## Hors scope
- Pas d'upload des PDF associés (l'uploader PDF existant reste pour ça).
- Pas de mise à jour de patients existants (insert only). Doublons potentiels — on pourra ajouter un dédoublonnage `nom+prenom+date_naissance` dans un second temps si besoin.
