
-- Partage global : tout utilisateur authentifié accède à tous les patients
CREATE OR REPLACE FUNCTION public.owns_patient(_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = _patient_id)
$$;

CREATE OR REPLACE FUNCTION public.owns_episode(_episode_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.episodes e WHERE e.id = _episode_id)
$$;

-- Policies sur patients : tous les utilisateurs authentifiés
DROP POLICY IF EXISTS "own patients select" ON public.patients;
DROP POLICY IF EXISTS "own patients insert" ON public.patients;
DROP POLICY IF EXISTS "own patients update" ON public.patients;
DROP POLICY IF EXISTS "own patients delete" ON public.patients;

CREATE POLICY "auth can select patients" ON public.patients
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth can insert patients" ON public.patients
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth can update patients" ON public.patients
  FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth can delete patients" ON public.patients
  FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
