CREATE TABLE public.ai_feedback_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES public.conciliation_ai_analyses(id) ON DELETE CASCADE,
  validation_id uuid NOT NULL REFERENCES public.conciliation_validations(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL,
  model text,
  task_slug text NOT NULL DEFAULT 'analyze',
  category text NOT NULL,
  item_index integer NOT NULL,
  decision text NOT NULL CHECK (decision IN ('accepted','rejected','modified')),
  severity_original text,
  severity_corrected text,
  had_override boolean NOT NULL DEFAULT false,
  comment text,
  llm_payload jsonb,
  human_payload jsonb,
  pharmacien_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_feedback_signals TO authenticated;
GRANT ALL ON public.ai_feedback_signals TO service_role;

ALTER TABLE public.ai_feedback_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read feedback signals"
  ON public.ai_feedback_signals FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role manages feedback signals"
  ON public.ai_feedback_signals FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_ai_feedback_signals_model_cat ON public.ai_feedback_signals(model, task_slug, category, decision);
CREATE INDEX idx_ai_feedback_signals_validation ON public.ai_feedback_signals(validation_id);
CREATE INDEX idx_ai_feedback_signals_created ON public.ai_feedback_signals(created_at DESC);