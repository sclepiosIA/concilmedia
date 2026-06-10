
-- 0. Élargit la contrainte de kind pour inclure le moteur ML
ALTER TABLE public.ai_providers DROP CONSTRAINT IF EXISTS ai_providers_kind_check;
ALTER TABLE public.ai_providers
  ADD CONSTRAINT ai_providers_kind_check
  CHECK (kind IN ('lovable','openai','azure_openai','google','anthropic','openai_compatible','ml_concilmed'));

-- 1. Mode d'exécution par tâche IA : LLM seul, ML seul, ou les deux
ALTER TABLE public.ai_tasks
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'llm'
  CHECK (execution_mode IN ('llm','ml','both'));

-- 2. Traçabilité de la source d'analyse
ALTER TABLE public.conciliation_ai_analyses
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'llm'
  CHECK (source IN ('llm','ml','consensus'));

ALTER TABLE public.risk_scores
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'llm'
  CHECK (source IN ('llm','ml','consensus'));

-- 3. Seed du provider ML ConcilMed (désactivé par défaut)
INSERT INTO public.ai_providers (name, kind, base_url, is_active, extra_config)
SELECT 'ML ConcilMed', 'ml_concilmed', NULL, false,
       '{"layer2_threshold": 0.5, "layer4_threshold": 0.5}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.ai_providers WHERE kind = 'ml_concilmed');

-- 4. Seed des 2 tâches ML
INSERT INTO public.ai_tasks (slug, label, description, model, provider_id, system_prompt, execution_mode)
SELECT 'ml_prioritize_patient',
       'ML — Priorisation patient (Étage 2)',
       'Score de risque DNI (HistGradientBoosting + LogisticRegression). Attention : performance presque entièrement portée par nb_meds_hosp.',
       'layer2', NULL, '', 'ml'
WHERE NOT EXISTS (SELECT 1 FROM public.ai_tasks WHERE slug = 'ml_prioritize_patient');

INSERT INTO public.ai_tasks (slug, label, description, model, provider_id, system_prompt, execution_mode)
SELECT 'ml_omission_severity',
       'ML — Gravité d''un oubli (Étage 4)',
       'Probabilité qu''un médicament oublié à l''admission soit un oubli grave (niveau 3).',
       'layer4', NULL, '', 'ml'
WHERE NOT EXISTS (SELECT 1 FROM public.ai_tasks WHERE slug = 'ml_omission_severity');
