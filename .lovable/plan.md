## Refonte globale UI — charte ConcilMed·IA

Refonte cohérente avec l'identité visuelle du logo fourni : palette **navy profond + teal/cyan**, accent **healthcare/IA**, typographie **Sora (titres) + Manrope (corps)**. Le logo est intégré tel quel (image) dans le header.

### Palette extraite du logo

| Token | Usage | Couleur |
|---|---|---|
| `--navy-900` | Texte fort, headers, CONCILMED | `#0d1b3d` |
| `--navy-700` | Primary / boutons | `#1a2e5c` |
| `--navy-500` | Hover / borders forts | `#2a4178` |
| `--teal-500` | Accent IA, "IA" du logo, CTA secondaire | `#2dd4bf` |
| `--teal-600` | Accent foncé, focus ring | `#0d9488` |
| `--cyan-200` | Halos doux, backgrounds info | `#a5f3fc` |
| `--paper` | Fond app | `#f8fafc` |
| `--paper-2` | Cartes / sidebar | `#ffffff` |

Sémantique gravité conservée (crit/major/minor/ok) en harmonisant les bases vers la nouvelle palette.

### 1. Tokens — `src/styles.css`

- Réécriture du bloc `:root` (et `.dark`) avec les nouvelles valeurs OKLCH dérivées du navy/teal.
- `--primary` → navy-700, `--accent` → teal-500, `--ring` → teal-600.
- Sidebar : `--sidebar` blanc, `--sidebar-primary` navy-700, `--sidebar-accent` teal-50.
- Ajout `--gradient-brand: linear-gradient(135deg, var(--navy-700), var(--teal-500))` et `--shadow-brand` (ombre teintée navy).
- Polices : `--font-sans: "Manrope", ...`, `--font-display: "Sora", ...`. Suppression IBM Plex/Newsreader.
- Nouvel utilitaire `@utility font-display` (Sora 600/700, tracking -0.02em).

### 2. Polices — `src/routes/__root.tsx`

- Remplacer le `<link>` Google Fonts par Sora (400/600/700/800) + Manrope (400/500/600/700).
- Title + meta inchangés (déjà OK).

### 3. Logo intégré

- Upload du logo via Lovable Assets CLI depuis `/mnt/user-uploads/Logo-WhatsApp-Défi_1_-_ConcilMed_IA_1.png` → `src/assets/concilmed-logo.png.asset.json`.
- Import dans `_authenticated/route.tsx` et `auth.tsx`.

### 4. Header — `src/routes/_authenticated/route.tsx`

- Remplacer l'icône `Pill` par `<img src={logo} className="h-9 w-9 rounded-full" />`.
- Wordmark : `<span className="font-display font-bold">ConcilMed<span className="text-teal-600">·IA</span></span>` + sous-titre fin "Conciliation médicamenteuse".
- Hauteur header 16, fond `bg-card/80 backdrop-blur` + bordure douce, sticky.
- Nav items : pills arrondies, état actif teal underline.

### 5. Page Auth — `src/routes/auth.tsx`

- Hero gauche avec logo grand format + tagline "L'IA au service de la conciliation médicamenteuse" sur fond `--gradient-brand` subtil, formulaire à droite.

### 6. Composants clés — légère mise au goût de la nouvelle charte

- `ConciliationCompleteCard`, `AIAnalysisPanel`, `PharmacistDocumentCompareCard` : titres en `font-display`, badges concordance en teal, headers de cartes avec liseré dégradé.
- Boutons primaires : `bg-primary` (navy) ; boutons accent IA : nouvelle variante `bg-teal-600 text-white hover:bg-teal-700`.
- Aucune logique métier modifiée.

### Hors périmètre

- Pas de refonte du flux conciliation, pas de touches DB, pas de modif des server functions.
- Pas de mode sombre revisité (juste tokens cohérents).
- Pas de recréation SVG du logo (utilisation telle quelle).

### Fichiers modifiés / créés

- modifié : `src/styles.css`
- modifié : `src/routes/__root.tsx`
- modifié : `src/routes/_authenticated/route.tsx`
- modifié : `src/routes/auth.tsx`
- modifiés (légers) : `src/components/patient/ConciliationCompleteCard.tsx`, `src/components/conciliation/AIAnalysisPanel.tsx`, `src/components/conciliation/PharmacistDocumentCompareCard.tsx`
- créé : `src/assets/concilmed-logo.png.asset.json`
