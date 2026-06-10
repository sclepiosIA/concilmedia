
-- Cohorts table
CREATE TABLE public.cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag text NOT NULL,
  label text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, tag)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cohorts TO authenticated;
GRANT ALL ON public.cohorts TO service_role;
ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;
CREATE POLICY cohorts_owner ON public.cohorts FOR ALL TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE TRIGGER trg_cohorts_updated BEFORE UPDATE ON public.cohorts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Link patients to a cohort (in addition to existing cohort_tag string)
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS cohort_id uuid REFERENCES public.cohorts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_patients_cohort ON public.patients(cohort_id);

-- Pharmacist gold standard documents (one per patient/episode)
CREATE TABLE public.pharmacist_gold_standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  episode_id uuid REFERENCES public.episodes(id) ON DELETE SET NULL,
  cohort_id uuid REFERENCES public.cohorts(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  extracted_json jsonb,
  triage_complexe boolean,
  nb_divergences int,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacist_gold_standards TO authenticated;
GRANT ALL ON public.pharmacist_gold_standards TO service_role;
ALTER TABLE public.pharmacist_gold_standards ENABLE ROW LEVEL SECURITY;
CREATE POLICY pgs_owner ON public.pharmacist_gold_standards FOR ALL TO authenticated
  USING (uploaded_by = auth.uid() OR public.owns_patient(patient_id))
  WITH CHECK (uploaded_by = auth.uid());
CREATE INDEX idx_pgs_patient ON public.pharmacist_gold_standards(patient_id);
CREATE INDEX idx_pgs_cohort ON public.pharmacist_gold_standards(cohort_id);
CREATE TRIGGER trg_pgs_updated BEFORE UPDATE ON public.pharmacist_gold_standards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cached cohort evaluation results
CREATE TABLE public.cohort_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  metrics_ia jsonb,
  metrics_ml jsonb,
  per_patient jsonb,
  computed_by uuid NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cohort_evaluations TO authenticated;
GRANT ALL ON public.cohort_evaluations TO service_role;
ALTER TABLE public.cohort_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY cohort_eval_owner ON public.cohort_evaluations FOR ALL TO authenticated
  USING (computed_by = auth.uid()) WITH CHECK (computed_by = auth.uid());
CREATE INDEX idx_cohort_eval_cohort ON public.cohort_evaluations(cohort_id);
