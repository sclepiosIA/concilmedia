GRANT EXECUTE ON FUNCTION public.owns_patient(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.owns_episode(uuid) TO authenticated, anon, service_role;