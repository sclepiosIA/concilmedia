ALTER TABLE public.documents_sources
  ADD COLUMN IF NOT EXISTS prescriber_name TEXT,
  ADD COLUMN IF NOT EXISTS prescriber_specialty TEXT,
  ADD COLUMN IF NOT EXISTS prescription_date DATE;
CREATE INDEX IF NOT EXISTS idx_documents_sources_prescriber ON public.documents_sources(patient_id, prescriber_name);