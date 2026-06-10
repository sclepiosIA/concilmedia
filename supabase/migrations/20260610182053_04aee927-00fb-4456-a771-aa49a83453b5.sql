
-- 1. Restore per-owner isolation on patients
DROP POLICY IF EXISTS "shared patients" ON public.patients;
DROP POLICY IF EXISTS "own patients" ON public.patients;

CREATE POLICY "own patients select" ON public.patients
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "own patients insert" ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "own patients update" ON public.patients
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "own patients delete" ON public.patients
  FOR DELETE TO authenticated
  USING (auth.uid() = created_by);

-- 2. Restore filtering owns_patient / owns_episode
CREATE OR REPLACE FUNCTION public.owns_patient(_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.patients p
       WHERE p.id = _patient_id AND p.created_by = auth.uid()
     )
$function$;

CREATE OR REPLACE FUNCTION public.owns_episode(_episode_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.episodes e
       JOIN public.patients p ON p.id = e.patient_id
       WHERE e.id = _episode_id AND p.created_by = auth.uid()
     )
$function$;

-- 3. Revoke EXECUTE on sensitive SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.owns_patient(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.owns_episode(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ai_provider_set_key(uuid, text, text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_provider_decrypt_key(uuid, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_provider_set_key(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_provider_decrypt_key(uuid, text) TO service_role;
