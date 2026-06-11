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
  UNIQUE (cis, statut)
);
CREATE INDEX idx_drug_shortages_cis ON public.drug_shortages(cis);
CREATE INDEX idx_drug_shortages_denom ON public.drug_shortages(lower(denomination));

GRANT SELECT ON public.drug_shortages TO authenticated;
GRANT ALL ON public.drug_shortages TO service_role;
ALTER TABLE public.drug_shortages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read shortages"
  ON public.drug_shortages FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE VIEW public.v_drug_cheapest_generic AS
WITH base AS (
  SELECT s.cis,
         s.denomination,
         s.forme,
         c.denomination_substance AS substance,
         c.dosage_substance AS dosage,
         p.prix_eur
  FROM public.bdpm_specialites s
  JOIN public.bdpm_presentations p ON p.cis = s.cis
  JOIN public.bdpm_compositions c ON c.cis = s.cis
  WHERE p.prix_eur IS NOT NULL
    AND s.etat_commercialisation ILIKE '%commerc%'
    AND c.denomination_substance IS NOT NULL
),
ranked AS (
  SELECT b1.cis,
         b1.denomination,
         b1.prix_eur AS prix_actuel,
         b2.cis AS cis_generique,
         b2.denomination AS denomination_generique,
         b2.prix_eur AS prix_generique,
         (b1.prix_eur - b2.prix_eur) AS economie_eur,
         row_number() OVER (PARTITION BY b1.cis ORDER BY b2.prix_eur ASC) AS rn
  FROM base b1
  JOIN base b2 ON b2.cis <> b1.cis
              AND lower(b2.substance) = lower(b1.substance)
              AND lower(coalesce(b2.dosage,'')) = lower(coalesce(b1.dosage,''))
              AND lower(coalesce(b2.forme,'')) = lower(coalesce(b1.forme,''))
              AND b2.prix_eur < b1.prix_eur
)
SELECT cis, denomination, prix_actuel,
       cis_generique, denomination_generique, prix_generique, economie_eur
FROM ranked WHERE rn = 1;

GRANT SELECT ON public.v_drug_cheapest_generic TO authenticated, service_role;