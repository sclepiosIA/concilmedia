# Application de la charte graphique ConcilMed·IA

## Objectif
Aligner l'app sur la charte fournie : palette papier/encre/bleu, sémantique de gravité (critique/majeure/mineure/ok), typographies (Newsreader serif, IBM Plex Sans, IBM Plex Mono), ombres et radius.

## Périmètre
Modifications **uniquement visuelles** (tokens de design + typographies). Aucune logique métier, aucune structure JSX modifiée, aucun composant supprimé. Les composants shadcn existants héritent automatiquement via les variables CSS sémantiques.

## Étapes

### 1. Charger les polices
Ajouter les `<link>` Google Fonts (Newsreader + IBM Plex Sans + IBM Plex Mono) dans le head racine (`src/routes/__root.tsx`).

### 2. Réécrire `src/styles.css` (tokens)
- Remplacer les valeurs `oklch` des tokens shadcn (`--background`, `--foreground`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--card`, `--popover`, `--sidebar*`, `--ring`) par les couleurs de la charte converties en oklch :
  - `--background` ← `--paper` (#fbfcfe)
  - `--foreground` ← `--ink` (#18212f)
  - `--primary` ← `--blue-600` (#1d54c4), `--primary-foreground` blanc papier
  - `--secondary` / `--muted` ← `--paper-2` / `--paper-3`
  - `--muted-foreground` ← `--ink-3` (#6b7888)
  - `--border` / `--input` ← `--line` (#dce4ee)
  - `--destructive` ← `--crit` (#c0392f)
  - `--card` / `--popover` ← blanc papier
  - `--sidebar` ← `--paper-2`, accents bleus
- Ajouter les tokens sémantiques charte (exposés en utilitaires Tailwind via `@theme inline`) :
  - `--color-crit`, `--color-crit-bg`, `--color-crit-line`
  - `--color-major`, `--color-major-bg`, `--color-major-line`
  - `--color-minor`, `--color-minor-bg`
  - `--color-ok`, `--color-ok-bg`, `--color-ok-line`
  - `--color-ink-2`, `--color-ink-3`, `--color-ink-4`
  - `--color-paper-2`, `--color-paper-3`
- Ajouter les tokens de typo, ombres et radius :
  - `--font-serif: "Newsreader", Georgia, serif`
  - `--font-sans: "IBM Plex Sans", system-ui, sans-serif`
  - `--font-mono: "IBM Plex Mono", ui-monospace, monospace`
  - `--shadow-sm/-md/-lg` charte
  - `--radius: 10px`
- Mettre la `body` en `font-sans` (IBM Plex Sans) ; ajouter une classe utilitaire `.font-serif-display` pour les titres éditoriaux si besoin futur.
- Garder le mode `.dark` mais ajusté (encre claire / papier sombre dérivés).

## Hors périmètre
- Aucun changement de composant React.
- Pas de refonte d'écran (les couleurs critique/majeure déjà utilisées dans `ClinicalAlertsPanel` continueront à fonctionner ; on pourra dans un 2e temps remplacer `text-red-*`/`text-amber-*` hard-codés par les classes sémantiques `text-crit`/`text-major` si tu le souhaites).
- Pas de modification du logo.

## Fichiers touchés
- `src/styles.css` (réécrit)
- `src/routes/__root.tsx` (links polices)
