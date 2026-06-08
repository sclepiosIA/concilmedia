
ALTER FUNCTION public.set_updated_at() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.owns_patient(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.owns_episode(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owns_patient(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_episode(uuid) TO authenticated;
