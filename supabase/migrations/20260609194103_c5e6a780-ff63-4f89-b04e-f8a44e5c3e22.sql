
CREATE TABLE public.pharmacist_conciliation_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  analysis_id UUID NOT NULL UNIQUE REFERENCES public.conciliation_ai_analyses(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  episode_id UUID REFERENCES public.episodes(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  comparison_payload JSONB,
  compared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pharmacist_conciliation_documents TO authenticated;
GRANT ALL ON public.pharmacist_conciliation_documents TO service_role;

ALTER TABLE public.pharmacist_conciliation_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage pharmacist documents"
  ON public.pharmacist_conciliation_documents
  FOR ALL
  USING (public.owns_patient(patient_id))
  WITH CHECK (public.owns_patient(patient_id));

CREATE TRIGGER set_pharmacist_doc_updated_at
  BEFORE UPDATE ON public.pharmacist_conciliation_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_pharmacist_doc_patient ON public.pharmacist_conciliation_documents(patient_id);
CREATE INDEX idx_pharmacist_doc_analysis ON public.pharmacist_conciliation_documents(analysis_id);
