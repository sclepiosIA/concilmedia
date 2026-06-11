# Piste #9 v2 — Conciliation de sortie (extensions)

La v1 est livrée (table `discharge_letters`, comparaison habituel/entrée/sortie, génération IA, route `/episodes/$episodeId/sortie`, statuts brouillon/prête/envoyée, impression navigateur). Cette v2 corrige les limites listées et professionnalise le module.

## Objectifs v2

1. Export PDF natif (au lieu de `window.print`) — réutilisable, archivable, signable.
2. Envoi MSSanté simulé avec journal d'envoi (vraie intégration API hors v2, mais traçabilité prête).
3. Édition manuelle de la lettre générée avant validation (le pharmacien doit pouvoir corriger).
4. Versioning : régénérer crée une nouvelle version sans écraser l'ancienne (déjà partiellement le cas, à formaliser + UI).
5. Pré-remplissage automatique du médecin traitant depuis la fiche patient si renseigné.
6. Traçabilité fine : qui a généré, validé, envoyé, à quelle date.
7. Inclusion explicite des allergies et comorbidités dans la lettre.

## Spécifications

### 1. Migration (1 seule)

- `discharge_letters` : ajouter colonnes
  - `version int NOT NULL DEFAULT 1` (rang dans la série pour cet `episode_id`)
  - `parent_letter_id uuid NULL REFERENCES discharge_letters(id)` (filiation)
  - `validated_by uuid NULL REFERENCES auth.users(id)`, `validated_at timestamptz NULL`
  - `sent_by uuid NULL REFERENCES auth.users(id)`
  - `delivery_channel text NULL` (`mssante`, `print`, `manual`)
  - `delivery_log jsonb NOT NULL DEFAULT '[]'` (entrées `{at, by, channel, recipient, status, message}`)
- `patients` : ajouter `medecin_traitant_nom text NULL`, `medecin_traitant_mssante text NULL`, `pharmacien_officine_nom text NULL`, `pharmacien_officine_mssante text NULL` (si absents).
- Pas de nouvelle table.

### 2. Server fns (`src/lib/discharge/`)

- `updateDischargeLetter` — patch `letter_html`, `recipient_*` (uniquement statut `brouillon`).
- `validateDischargeLetter` — passe `brouillon` → `prete`, stamp `validated_by/at`.
- `regenerateDischargeLetter` — crée une nouvelle ligne `version = max+1`, `parent_letter_id = current`, marque l'ancienne `clos` (statut élargi : ajouter `'clos'` au CHECK).
- `sendDischargeLetterMSSante` — v2 : push une entrée dans `delivery_log`, set `status='envoyee'`, `sent_by`, `sent_at`, `delivery_channel='mssante'`. Vérifie au moins une adresse MSSanté présente. Hors v2 : appel API MSSanté réel.
- `exportDischargeLetterPdf` — server fn renvoyant `{ base64, filename }`, génère le PDF côté serveur via `pdf-lib` (déjà utilisé par `pdfExport.functions.ts`).

Prompt IA enrichi : injecter allergies sévères et comorbidités principales du patient pour que la section « Recommandations » soit personnalisée.

### 3. UI — `episodes.$episodeId.sortie.tsx`

- **Pré-remplissage** des champs destinataires depuis `patients.medecin_traitant_*` / `pharmacien_officine_*` au montage.
- **Bouton « Modifier »** sur une lettre en `brouillon` → ouvre un `Textarea` (ou éditeur minimal contenteditable) sur `letter_html`, bouton « Enregistrer ».
- **Bouton « Régénérer »** → appelle `regenerateDischargeLetter`, conserve les anciennes versions affichées repliées avec badge `v1`, `v2`...
- **Bouton « Valider »** (uniquement `brouillon`) → `validateDischargeLetter`, passage en `prete`.
- **Bouton « Envoyer via MSSanté »** (uniquement `prete`) → `sendDischargeLetterMSSante` (v2 simulé), désactivé si aucune adresse MSSanté.
- **Bouton « Télécharger PDF »** remplace « Imprimer » (impression reste possible depuis le PDF).
- **Journal d'envoi** : si `delivery_log` non vide, afficher timeline (canal, destinataire, statut, date, opérateur).
- **Affichage allergies/comorbidités** dans l'en-tête de la page pour rappel.

### 4. Statut

`ameliorations.tsx` : Piste #9 passe à `statut: "Livré v2"` avec note des hors-scope restants (envoi MSSanté **réel** + push DMP).

## Fichiers touchés

```
supabase migration (1)
src/lib/discharge/dischargeLetter.functions.ts   (étendu)
src/lib/discharge/exportDischargePdf.functions.ts (nouveau)
src/routes/_authenticated/episodes.$episodeId.sortie.tsx  (étendu)
src/components/discharge/LetterVersionItem.tsx   (nouveau, extrait UI)
src/components/discharge/LetterEditor.tsx        (nouveau, édition HTML simple)
src/routes/_authenticated/ameliorations.tsx      (statut)
```

## Hors v2 (intentionnel)

- Appel API MSSanté réel (nécessite carte CPS + certificat ANS) — simulé en v2.
- Push DMP / Mon Espace Santé (couvert par Piste #10).
- Éditeur WYSIWYG riche (TipTap) — v2 = textarea HTML avec aperçu, suffisant pour corrections.
- Signature électronique du pharmacien — Piste séparée.

## Critères de validation

- Régénérer une lettre conserve l'ancienne avec son numéro de version.
- Modifier une lettre n'est possible qu'en `brouillon`.
- Le bouton MSSanté est désactivé tant qu'aucune adresse n'est saisie.
- Le PDF téléchargé contient l'en-tête patient, la synthèse des changements, l'ordonnance de sortie et les destinataires.
- Le journal d'envoi liste l'historique des envois avec horodatage et opérateur.
