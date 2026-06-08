
CREATE TABLE public.biologie_resultats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  date_prelevement DATE,
  parametre TEXT NOT NULL,
  valeur NUMERIC,
  unite TEXT,
  valeur_texte TEXT,
  source TEXT NOT NULL DEFAULT 'manuel' CHECK (source IN ('manuel','pdf_import','autre')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX idx_biologie_patient ON public.biologie_resultats(patient_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.biologie_resultats TO authenticated;
GRANT ALL ON public.biologie_resultats TO service_role;

ALTER TABLE public.biologie_resultats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own biologie" ON public.biologie_resultats
  FOR ALL TO authenticated
  USING (public.owns_patient(patient_id))
  WITH CHECK (public.owns_patient(patient_id));

ALTER TABLE public.traitements_habituels DROP CONSTRAINT IF EXISTS traitements_habituels_source_check;
ALTER TABLE public.traitements_habituels ADD CONSTRAINT traitements_habituels_source_check
  CHECK (source IN ('ordonnance','patient','MT','pharmacie','autre','pdf_import','ordonnance_ocr'));
