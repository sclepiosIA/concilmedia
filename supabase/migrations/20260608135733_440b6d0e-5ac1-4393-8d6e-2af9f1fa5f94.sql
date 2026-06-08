
REVOKE EXECUTE ON FUNCTION public.owns_patient(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.owns_episode(uuid) FROM PUBLIC, anon, authenticated;
