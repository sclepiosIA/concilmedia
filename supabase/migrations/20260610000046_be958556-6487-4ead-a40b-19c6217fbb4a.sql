
-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ ROLES ============
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ============ AI PROVIDERS ============
CREATE TABLE IF NOT EXISTS public.ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('lovable','openai','azure_openai','google','anthropic','openai_compatible')),
  base_url text,
  api_key_encrypted bytea,
  extra_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_providers TO authenticated;
GRANT ALL ON public.ai_providers TO service_role;
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage providers" ON public.ai_providers;
CREATE POLICY "Admins manage providers" ON public.ai_providers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ AI TASKS ============
CREATE TABLE IF NOT EXISTS public.ai_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  provider_id uuid REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  model text NOT NULL,
  system_prompt text NOT NULL DEFAULT '',
  temperature numeric,
  max_tokens integer,
  current_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_tasks TO authenticated;
GRANT ALL ON public.ai_tasks TO service_role;
ALTER TABLE public.ai_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage tasks" ON public.ai_tasks;
CREATE POLICY "Admins manage tasks" ON public.ai_tasks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ AI PROMPT VERSIONS ============
CREATE TABLE IF NOT EXISTS public.ai_prompt_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.ai_tasks(id) ON DELETE CASCADE,
  version integer NOT NULL,
  system_prompt text NOT NULL,
  model text NOT NULL,
  provider_id uuid REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  temperature numeric,
  max_tokens integer,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, version)
);

GRANT SELECT ON public.ai_prompt_versions TO authenticated;
GRANT ALL ON public.ai_prompt_versions TO service_role;
ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read versions" ON public.ai_prompt_versions;
CREATE POLICY "Admins read versions" ON public.ai_prompt_versions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- updated_at trigger (reuse existing set_updated_at)
DROP TRIGGER IF EXISTS trg_ai_providers_updated ON public.ai_providers;
CREATE TRIGGER trg_ai_providers_updated BEFORE UPDATE ON public.ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ai_tasks_updated ON public.ai_tasks;
CREATE TRIGGER trg_ai_tasks_updated BEFORE UPDATE ON public.ai_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SEED ============
-- Default Lovable provider (no key needed, uses LOVABLE_API_KEY env)
INSERT INTO public.ai_providers (name, kind, is_active)
VALUES ('Lovable AI Gateway', 'lovable', true)
ON CONFLICT DO NOTHING;

-- Seed 10 AI tasks (system_prompt left empty → code falls back to inline default)
WITH p AS (SELECT id FROM public.ai_providers WHERE kind = 'lovable' LIMIT 1)
INSERT INTO public.ai_tasks (slug, label, description, provider_id, model, system_prompt)
SELECT s.slug, s.label, s.description, p.id, s.model, ''
FROM p, (VALUES
  ('analyze',                       'Conciliation — analyse simple',          'Analyse de conciliation médicamenteuse basique',          'google/gemini-3-flash-preview'),
  ('analyze_patient_complete',      'Conciliation — analyse complète',        'Analyse complète comparant traitements ville vs hôpital',  'google/gemini-3-flash-preview'),
  ('analyze_patient_synthesis',     'Synthèse patient',                        'Synthèse des traitements habituels du patient',            'google/gemini-3-flash-preview'),
  ('extract_ordonnance',            'Extraction ordonnance',                   'Extraction de médicaments depuis une ordonnance scannée',  'google/gemini-3-flash-preview'),
  ('extract_lettre_admission',      'Extraction lettre admission',             'Extraction du profil patient depuis une lettre d''admission','google/gemini-3-flash-preview'),
  ('extract_biologie',              'Extraction biologie',                     'Extraction des résultats biologiques',                     'google/gemini-3-flash-preview'),
  ('match_prescription',            'Matching prescription',                   'Matching IA entre prescription et traitement habituel',    'google/gemini-2.5-flash'),
  ('pharmacist_doc',                'Document pharmacien',                     'Génération du document de conciliation pharmacien',        'google/gemini-3-flash-preview'),
  ('bulk_import',                   'Import en masse',                         'Extraction de dossiers patients complets',                 'google/gemini-3-flash-preview'),
  ('validate_conciliation',         'Validation conciliation',                 'Validation finale de la conciliation',                     'google/gemini-3-flash-preview')
) AS s(slug, label, description, model)
ON CONFLICT (slug) DO NOTHING;

-- Seed v1 prompt versions for each task
INSERT INTO public.ai_prompt_versions (task_id, version, system_prompt, model, provider_id, note)
SELECT t.id, 1, t.system_prompt, t.model, t.provider_id, 'Initial seed'
FROM public.ai_tasks t
ON CONFLICT (task_id, version) DO NOTHING;
