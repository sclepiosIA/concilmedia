CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Spécialités (CIS)
CREATE TABLE public.bdpm_specialites (
  cis bigint PRIMARY KEY,
  denomination text NOT NULL,
  forme text,
  voies text,
  statut_amm text,
  type_amm text,
  etat_commercialisation text,
  date_amm text,
  titulaire text,
  surveillance_renforcee boolean DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bdpm_specialites TO authenticated, anon;
GRANT ALL ON public.bdpm_specialites TO service_role;
ALTER TABLE public.bdpm_specialites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read bdpm_specialites" ON public.bdpm_specialites FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Service writes bdpm_specialites" ON public.bdpm_specialites FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_bdpm_specialites_denom_trgm ON public.bdpm_specialites USING gin (denomination gin_trgm_ops);
CREATE INDEX idx_bdpm_specialites_denom_lower ON public.bdpm_specialites (lower(denomination));

-- Présentations (CIP)
CREATE TABLE public.bdpm_presentations (
  cip7 bigint PRIMARY KEY,
  cip13 bigint UNIQUE,
  cis bigint NOT NULL REFERENCES public.bdpm_specialites(cis) ON DELETE CASCADE,
  libelle text,
  statut_admin text,
  etat_commercialisation text,
  date_declaration_commerc text,
  agrement_collectivites boolean,
  taux_remboursement text,
  prix_eur numeric
);
GRANT SELECT ON public.bdpm_presentations TO authenticated, anon;
GRANT ALL ON public.bdpm_presentations TO service_role;
ALTER TABLE public.bdpm_presentations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read bdpm_presentations" ON public.bdpm_presentations FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Service writes bdpm_presentations" ON public.bdpm_presentations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_bdpm_presentations_cis ON public.bdpm_presentations(cis);

-- Compositions (substances)
CREATE TABLE public.bdpm_compositions (
  id bigserial PRIMARY KEY,
  cis bigint NOT NULL REFERENCES public.bdpm_specialites(cis) ON DELETE CASCADE,
  designation_element_pharma text,
  code_substance bigint,
  denomination_substance text,
  dosage_substance text,
  reference_dosage text,
  nature_composant text
);
GRANT SELECT ON public.bdpm_compositions TO authenticated, anon;
GRANT ALL ON public.bdpm_compositions TO service_role;
ALTER TABLE public.bdpm_compositions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read bdpm_compositions" ON public.bdpm_compositions FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Service writes bdpm_compositions" ON public.bdpm_compositions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_bdpm_compositions_cis ON public.bdpm_compositions(cis);
CREATE INDEX idx_bdpm_compositions_subst_trgm ON public.bdpm_compositions USING gin (denomination_substance gin_trgm_ops);
CREATE INDEX idx_bdpm_compositions_subst_lower ON public.bdpm_compositions (lower(denomination_substance));

-- Classification ATC
CREATE TABLE public.bdpm_atc (
  cis bigint PRIMARY KEY REFERENCES public.bdpm_specialites(cis) ON DELETE CASCADE,
  code_atc text NOT NULL,
  libelle_atc text
);
GRANT SELECT ON public.bdpm_atc TO authenticated, anon;
GRANT ALL ON public.bdpm_atc TO service_role;
ALTER TABLE public.bdpm_atc ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read bdpm_atc" ON public.bdpm_atc FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Service writes bdpm_atc" ON public.bdpm_atc FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_bdpm_atc_code ON public.bdpm_atc(code_atc);

-- Journal d'imports
CREATE TABLE public.bdpm_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  files_processed jsonb,
  rows_total integer DEFAULT 0,
  error text,
  triggered_by uuid
);
GRANT SELECT ON public.bdpm_import_runs TO authenticated;
GRANT ALL ON public.bdpm_import_runs TO service_role;
ALTER TABLE public.bdpm_import_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read bdpm_import_runs" ON public.bdpm_import_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service writes bdpm_import_runs" ON public.bdpm_import_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_bdpm_import_runs_started ON public.bdpm_import_runs(started_at DESC);

-- Enrichissement BDPM des prescriptions (colonnes optionnelles, peuplées par la normalisation)
ALTER TABLE public.traitements_habituels ADD COLUMN IF NOT EXISTS cis bigint;
ALTER TABLE public.traitements_habituels ADD COLUMN IF NOT EXISTS code_atc text;
ALTER TABLE public.prescriptions_hospitalieres ADD COLUMN IF NOT EXISTS cis bigint;
ALTER TABLE public.prescriptions_hospitalieres ADD COLUMN IF NOT EXISTS code_atc text;