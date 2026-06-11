
# Plan — Enrichissement de l'analyse pharmaceutique

Ajout de 4 nouvelles dimensions au moteur d'analyse, exploitées par l'IA et affichées dans les panneaux existants (`AIAnalysisPanel`, `ClinicalAlertsPanel`, `ConciliationCompleteCard`).

## 1. Tensions & ruptures d'approvisionnement (automatisé au max)

**Source automatique** : l'ANSM publie l'open data des ruptures/tensions sur data.gouv.fr (jeu `ansm-rupture-stock-medicaments` au format CSV/JSON, mis à jour quotidiennement). On automatise via :

- Table `drug_shortages` (CIS, dénomination, statut `tension|rupture|arret`, date_debut, date_fin_prevue, raison, alternative_proposee, source_url, imported_at).
- Endpoint `POST /api/public/hooks/sync-ansm-shortages` (TanStack server route, vérif `apikey`) qui :
  - fetch le CSV ANSM,
  - upsert dans `drug_shortages` (clé = CIS),
  - jointure avec `bdpm_specialites` pour rattacher le CIS aux dénominations connues.
- Cron `pg_cron` quotidien (06:00 UTC) appelant cet endpoint.
- Bouton "Synchroniser maintenant" dans l'UI admin (page `/admin/ai/index` → nouvel onglet "Ruptures").
- Fallback : on lit aussi `bdpm_presentations.etat_commercialisation` (Arrêt / Suspension) en complément.

**Côté analyse** : avant l'appel LLM, on filtre les médicaments du dossier dont la DCI/CIS apparaît dans `drug_shortages` ou en `Arrêt de commercialisation`. On injecte la liste dans le prompt et on demande à l'IA de proposer une alternative documentée.

## 2. Switch IV → PO (hybride règle + LLM)

- Whitelist `IV_TO_PO_CANDIDATES` (biodispo ≥ 80% ou indication de relais) : levofloxacine, ciprofloxacine, métronidazole, linézolide, fluconazole, paracétamol, oméprazole/ésoméprazole, corticoïdes, clindamycine, doxycycline, rifampicine.
- Heuristique dans `analyzePatientConciliationComplete` : si `prescriptions_hospitalieres[i].voie_administration ∈ {IV, IVL, IVD}` et DCI ∈ whitelist → ajout d'un flag `iv_po_candidate` (alimenté avec patient stable détecté via signes : pas de sepsis sévère dans antécédents/comorbidités récents, tolérance digestive).
- Injection dans le prompt : "Pour chaque IV candidat, valide/écarte le relais PO en citant la biodisponibilité et le critère clinique limitant."
- LLM enrichit avec posologie PO équivalente, économies attendues (lien avec § 3), références (SPILF, SFAR).

## 3. Médico-économique & génériques (coût + alternative générique)

- Vue SQL `v_drug_cheapest_generic` : pour chaque CIS, renvoie le CIS le moins cher partageant DCI normalisée + dosage + forme dans `bdpm_specialites + bdpm_presentations + bdpm_compositions`, ainsi que `prix_eur` et économie potentielle.
- Helper `buildEconomicsContext(dossier)` : pour chaque traitement habituel et prescription hospitalière, calcule :
  - `coût_unitaire_eur` (depuis BDPM),
  - `coût_journalier_estime_eur` (× posologie quotidienne),
  - `generique_moins_cher` (CIS, dénomination, prix, économie %).
- Injection dans le prompt LLM dans une section dédiée. Nouveau champ JSON :
  ```json
  "economie": {
    "cout_journalier_total_eur": number,
    "substitutions_generiques": [{"medicament":"","generique_propose":"","economie_eur_par_jour":number,"confiance":0-100}],
    "synthese_medicoeconomique":"1-2 phrases"
  }
  ```
- Affichage : nouveau bloc "Médico-économie" dans `AIAnalysisPanel` (badge €/jour + tableau substitutions, copyable).

## 4. Wiring transverse

- `AIAnalysisPayload` étendu (`tensions_approvisionnement`, `relais_iv_po`, `economie`).
- `analyze.functions.ts` + `analyzePatientConciliationComplete.functions.ts` : ajoutent les 3 sections au system prompt + au schéma JSON, et passent en input :
  - `shortages_context` (depuis `drug_shortages`),
  - `iv_po_candidates` (heuristique),
  - `economics_context` (helper §3).
- `ClinicalAlertsPanel` : 3 nouveaux groupes (icônes : AlertTriangle pour rupture, Pill pour IV→PO, EuroSign pour éco).
- `cohort_evaluations` & `eval` : on ajoute `tension`, `iv_po`, `eco` comme catégories de divergences scorables (compteurs simples, pas de F1 v1).
- Audit : actions `SHORTAGES_SYNC`, `IV_PO_SUGGEST`, `ECON_SUGGEST` dans `audit/actions.ts`.

## Détails techniques

### Migration `xxxx_shortages_economics.sql`
```sql
CREATE TABLE public.drug_shortages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cis text NOT NULL,
  denomination text,
  statut text NOT NULL CHECK (statut IN ('tension','rupture','arret','remise_a_disposition')),
  date_debut date,
  date_fin_prevue date,
  raison text,
  alternative text,
  source_url text,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cis, statut, date_debut)
);
CREATE INDEX ON public.drug_shortages(cis);
GRANT SELECT ON public.drug_shortages TO authenticated;
GRANT ALL ON public.drug_shortages TO service_role;
ALTER TABLE public.drug_shortages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read shortages" ON public.drug_shortages FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE VIEW public.v_drug_cheapest_generic AS
SELECT s.cis,
       s.denomination,
       g.cis  AS cis_generique,
       g.denomination AS denomination_generique,
       p.prix_eur AS prix_actuel,
       pg.prix_eur AS prix_generique,
       (p.prix_eur - pg.prix_eur) AS economie_eur
FROM bdpm_specialites s
JOIN bdpm_presentations p ON p.cis = s.cis
JOIN bdpm_compositions c ON c.cis = s.cis
JOIN bdpm_compositions cg ON cg.dosage = c.dosage
                          AND lower(cg.substance) = lower(c.substance)
JOIN bdpm_specialites g ON g.cis = cg.cis AND g.forme = s.forme AND g.cis <> s.cis
JOIN bdpm_presentations pg ON pg.cis = g.cis
WHERE p.prix_eur IS NOT NULL AND pg.prix_eur IS NOT NULL AND pg.prix_eur < p.prix_eur;
GRANT SELECT ON public.v_drug_cheapest_generic TO authenticated;
```

### Fichiers
**Créés**
- `supabase/migrations/<ts>_shortages_economics.sql`
- `src/routes/api/public/hooks/sync-ansm-shortages.ts`
- `src/lib/clinical/ivPoCandidates.ts` (whitelist + détecteur)
- `src/lib/clinical/economics.server.ts` (buildEconomicsContext + cheapestGeneric)
- `src/lib/clinical/shortages.server.ts` (lookup tension/rupture pour un dossier)
- `src/components/conciliation/EconomicsPanel.tsx`
- `src/components/conciliation/ShortagesPanel.tsx`
- `src/components/admin/ShortagesAdmin.tsx`

**Modifiés**
- `src/lib/conciliation/analyze.functions.ts` + `analyzePatientConciliationComplete.functions.ts` (schéma JSON, prompt, injection contexte)
- `src/lib/conciliation/analyzePatientSynthesis.functions.ts` (mêmes ajouts)
- `src/components/conciliation/AIAnalysisPanel.tsx` (rendu 3 nouveaux blocs)
- `src/components/conciliation/ClinicalAlertsPanel.tsx`
- `src/lib/audit/actions.ts` (3 actions)
- `src/routes/_authenticated/admin.ai.index.tsx` (onglet ruptures)
- `src/routes/_authenticated/ameliorations.tsx` (statut piste)
- `src/integrations/supabase/types.ts`

### Cron
`supabase--insert` après migration :
```sql
SELECT cron.schedule('sync-ansm-shortages-daily', '0 6 * * *',
  $$ SELECT net.http_post(
    url:='https://concilmedia.lovable.app/api/public/hooks/sync-ansm-shortages',
    headers:='{"Content-Type":"application/json","apikey":"<anon>"}'::jsonb,
    body:='{}'::jsonb
  ) $$);
```

## Hors v1
- Suggestions d'équivalents thérapeutiques inter-classe (ex : IPP cher → oméprazole).
- Calcul exact du coût hospitalier (UCD/T2A) — on reste sur les prix BDPM ville.
- Notification proactive (email/Slack) lors d'une nouvelle rupture touchant un patient actif.
- Scoring F1 dédié aux nouvelles catégories dans l'eval (juste comptage v1).

## Critères d'acceptation
- Le cron journalier alimente `drug_shortages` à partir du CSV ANSM ; bouton manuel disponible en admin.
- L'analyse IA d'un patient affiche : alertes rupture avec alternative, suggestions IV→PO motivées, bloc médico-économie avec coût/jour et générique le moins cher.
- Toutes les actions sont audit-loggées. RLS admin/auth respectée. Aucun secret exposé côté client.
