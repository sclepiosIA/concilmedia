
ALTER TABLE public.conciliation_ai_analyses
  ADD COLUMN IF NOT EXISTS run_tag text,
  ADD COLUMN IF NOT EXISTS model_label text;

CREATE INDEX IF NOT EXISTS idx_conciliation_ai_analyses_patient_run
  ON public.conciliation_ai_analyses(patient_id, run_tag);

ALTER TABLE public.cohort_evaluations
  ADD COLUMN IF NOT EXISTS run_tag text,
  ADD COLUMN IF NOT EXISTS model_label text;

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.cohort_evaluations'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.cohort_evaluations DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_cohort_evaluations_cohort_run_model
  ON public.cohort_evaluations(cohort_id, COALESCE(run_tag, ''), COALESCE(model_label, ''));

-- Seed providers Azure Foundry (lookup by name, insert if missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ai_providers WHERE name = 'Azure Foundry — Anthropic') THEN
    INSERT INTO public.ai_providers (name, kind, base_url, extra_config, is_active)
    VALUES ('Azure Foundry — Anthropic', 'anthropic',
            'https://ia-interne-resource.services.ai.azure.com/anthropic',
            '{"variant":"azure_foundry_anthropic"}'::jsonb, true);
  ELSE
    UPDATE public.ai_providers
      SET kind = 'anthropic',
          base_url = 'https://ia-interne-resource.services.ai.azure.com/anthropic',
          extra_config = '{"variant":"azure_foundry_anthropic"}'::jsonb,
          is_active = true,
          updated_at = now()
    WHERE name = 'Azure Foundry — Anthropic';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ai_providers WHERE name = 'Azure Foundry — OpenAI Responses') THEN
    INSERT INTO public.ai_providers (name, kind, base_url, extra_config, is_active)
    VALUES ('Azure Foundry — OpenAI Responses', 'azure_openai',
            'https://ia-interne-resource.services.ai.azure.com',
            '{"variant":"azure_foundry_responses"}'::jsonb, true);
  ELSE
    UPDATE public.ai_providers
      SET kind = 'azure_openai',
          base_url = 'https://ia-interne-resource.services.ai.azure.com',
          extra_config = '{"variant":"azure_foundry_responses"}'::jsonb,
          is_active = true,
          updated_at = now()
    WHERE name = 'Azure Foundry — OpenAI Responses';
  END IF;
END $$;
