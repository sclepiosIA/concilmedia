
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS external_ref TEXT;
ALTER TABLE public.episodes ADD COLUMN IF NOT EXISTS external_ref TEXT;
ALTER TABLE public.episodes ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES public.cohorts(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS patients_cohort_external_ref_uidx
  ON public.patients(cohort_id, external_ref) WHERE external_ref IS NOT NULL AND cohort_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS episodes_cohort_external_ref_uidx
  ON public.episodes(cohort_id, external_ref) WHERE external_ref IS NOT NULL AND cohort_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS patients_external_ref_idx ON public.patients(external_ref);
CREATE INDEX IF NOT EXISTS episodes_external_ref_idx ON public.episodes(external_ref);
