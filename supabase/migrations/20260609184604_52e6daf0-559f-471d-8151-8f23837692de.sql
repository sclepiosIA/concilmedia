CREATE TABLE public.conciliation_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.conciliation_ai_analyses(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  validated_by uuid NOT NULL,
  validated_at timestamptz NOT NULL DEFAULT now(),
  pharmacien_nom text,
  commentaire_global text,
  item_decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conciliation_validations_analysis_unique UNIQUE (analysis_id)
);

CREATE INDEX idx_cv_patient ON public.conciliation_validations (patient_id, validated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conciliation_validations TO authenticated;
GRANT ALL ON public.conciliation_validations TO service_role;

ALTER TABLE public.conciliation_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own conciliation validations"
  ON public.conciliation_validations
  FOR ALL
  TO authenticated
  USING (public.owns_patient(patient_id))
  WITH CHECK (public.owns_patient(patient_id));

CREATE TRIGGER trg_cv_updated_at
  BEFORE UPDATE ON public.conciliation_validations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();