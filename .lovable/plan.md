## Piste #7 v1 — OCR avancé des ordonnances

L'extraction actuelle (`extractOrdonnance`) passe une image/PDF à Gemini Vision via Lovable AI Gateway, puis `importExtractedMedications` enrichit silencieusement via BDPM. Trois faiblesses : un seul modèle, aucune confiance affichée, pas d'arbitrage côté pharmacien quand la BDPM ne matche pas.

Cette v1 fiabilise sans introduire de nouveau provider (Azure Document Intelligence resterait à arbitrer hors-sprint).

### 1. Pré-traitement image côté client
- Avant upload : si image, downscale max 2000 px côté long, conversion JPEG qualité 90, auto-rotation EXIF.
- PDF multi-pages : extraire chaque page en image (déjà supporté côté modèle, mais on bornera à 5 pages max).
- Affichage d'un aperçu corrigé dans `OrdonnanceUploader` avant lancement.

### 2. Extraction ensemble (2 passes parallèles)
- `extractOrdonnance` lance en parallèle deux modèles vision via le gateway :
  - `google/gemini-3-flash-preview` (actuel)
  - `openai/gpt-5-mini` (vision)
- Réconciliation côté serveur : pour chaque DCI, score = nombre de modèles d'accord (1 ou 2). On garde l'union, en marquant `agreement: "both" | "single"`.
- En cas d'échec d'un des deux modèles, on continue avec l'autre (pas de blocage).

### 3. Cross-check BDPM explicite
- Nouveau helper `crossCheckBdpm(med)` :
  - Recherche exacte sur `bdpm_specialites.nom` + `bdpm_compositions.dci`.
  - Sinon `pg_trgm` similarity > 0.5 → meilleure suggestion + score.
  - Sinon `match_status = "inconnu"` avec alternatives top-3.
- Résultat enrichi par ligne : `{ match_status: "exact"|"fuzzy"|"inconnu", confidence: 0..1, suggestions: [{dci, score, cis}] }`.

### 4. Auto-revue par le modèle (deuxième passe self-check)
- Une fois les lignes réconciliées, on renvoie l'image + le JSON au modèle Gemini avec un prompt « vérifie chaque ligne et donne un `field_confidence` 0..1 par champ + une `risk_note` si lecture incertaine ».
- Coût borné (1 call additionnel ; sauté si l'extraction n'a renvoyé aucune ligne).

### 5. UI de correction assistée
Refonte de `OrdonnanceUploader` :
- Tableau des lignes extraites avec, pour chaque ligne :
  - Badge `agreement` (deux modèles d'accord vs un seul).
  - Badge `match_status` BDPM (vert/ambre/rouge).
  - Champs éditables (DCI, dosage, voie, posologie).
  - Si `match_status ≠ exact` : combobox avec top-3 suggestions BDPM cliquables (alimente `cis` + `code_atc`).
  - Case « Inclure » (cochée par défaut sauf si `confidence < 0.4`).
- Bouton « Importer (N) » envoie le tableau corrigé à `importExtractedMedications` (signature inchangée côté écriture).

### 6. Persistance audit + RLHF
- Stocker le résultat brut (2 sorties modèles + lignes finales validées) dans `documents_sources` (ou nouvelle colonne JSONB `audit` sur l'enregistrement). 
- Émettre un `ai_feedback_signals` par ligne avec `signal_kind = "ocr_override"` quand la valeur finale diffère de la sortie modèle (alimente la piste 1).

### Fichiers
```text
src/lib/conciliation/extractOrdonnance.functions.ts        EDIT (ensemble + self-check + crossCheck)
src/lib/conciliation/crossCheckBdpm.server.ts              NEW (helper SQL trigram)
src/lib/conciliation/preprocessOrdonnance.ts               NEW (downscale/rotate canvas, client-safe)
src/components/conciliation/OrdonnanceUploader.tsx         EDIT (revue + import sélectif)
src/components/conciliation/OcrReviewTable.tsx             NEW (tableau de correction)
src/routes/_authenticated/ameliorations.tsx                EDIT (statut « Livré v1 »)
```

### Hors-périmètre (v2 ultérieur)
- Azure Document Intelligence modèle custom (nécessite labellisation interne + secret + provider supplémentaire).
- OCR offline / PWA.
- Corpus d'ordonnances annotées (dépendance organisationnelle).

### Risques / mitigations
- Coût double appel vision : borné à 2 modèles + 1 self-check max, court-circuité si la première passe rend 0 ligne.
- Latence : extraction passe de ~5 s à ~10 s en pire cas → UI affiche une barre de progression par étape (préprocessing → modèle A → modèle B → réconciliation → BDPM).
- Pas de fallback si les deux modèles échouent : toast d'erreur + lien pour ressayer avec autre fichier.

À ta validation, je passe en build.