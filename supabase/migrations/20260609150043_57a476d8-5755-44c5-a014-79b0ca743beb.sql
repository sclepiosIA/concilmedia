CREATE TABLE public.traitement_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  traitement_id UUID NOT NULL REFERENCES public.traitements_habituels(id) ON DELETE CASCADE,
  source_document_id UUID NOT NULL REFERENCES public.documents_sources(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(traitement_id, source_document_id)
);
CREATE INDEX idx_traitement_sources_traitement ON public.traitement_sources(traitement_id);
CREATE INDEX idx_traitement_sources_document ON public.traitement_sources(source_document_id);
GRANT SELECT, INSERT, DELETE ON public.traitement_sources TO authenticated;
GRANT ALL ON public.traitement_sources TO service_role;
ALTER TABLE public.traitement_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage links via owned patient" ON public.traitement_sources
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.traitements_habituels t WHERE t.id = traitement_id AND public.owns_patient(t.patient_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.traitements_habituels t WHERE t.id = traitement_id AND public.owns_patient(t.patient_id)));