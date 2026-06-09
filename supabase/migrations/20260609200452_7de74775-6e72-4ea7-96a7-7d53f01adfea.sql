
-- Share all patient data across all authenticated users
CREATE OR REPLACE FUNCTION public.owns_patient(_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.patients p WHERE p.id = _patient_id)
$$;

CREATE OR REPLACE FUNCTION public.owns_episode(_episode_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.episodes e WHERE e.id = _episode_id)
$$;

DROP POLICY IF EXISTS "own patients" ON public.patients;
CREATE POLICY "shared patients"
ON public.patients
FOR ALL
TO authenticated
USING (true)
WITH CHECK (auth.uid() IS NOT NULL);
