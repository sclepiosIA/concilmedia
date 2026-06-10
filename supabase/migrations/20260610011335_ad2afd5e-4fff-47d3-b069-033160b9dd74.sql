
-- Encrypt: takes plain text + master key, writes encrypted bytea on the provider row
CREATE OR REPLACE FUNCTION public.ai_provider_set_key(
  _provider_id uuid,
  _plain_key text,
  _master_key text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _plain_key IS NULL OR length(_plain_key) = 0 THEN
    UPDATE public.ai_providers SET api_key_encrypted = NULL WHERE id = _provider_id;
  ELSE
    UPDATE public.ai_providers
      SET api_key_encrypted = pgp_sym_encrypt(_plain_key, _master_key)
      WHERE id = _provider_id;
  END IF;
END $$;

-- Decrypt: returns plain text
CREATE OR REPLACE FUNCTION public.ai_provider_decrypt_key(
  _provider_id uuid,
  _master_key text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cipher bytea;
BEGIN
  SELECT api_key_encrypted INTO _cipher FROM public.ai_providers WHERE id = _provider_id;
  IF _cipher IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(_cipher, _master_key);
END $$;

-- Lock down: only service_role may call (server-side via supabaseAdmin)
REVOKE ALL ON FUNCTION public.ai_provider_set_key(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_provider_decrypt_key(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_provider_set_key(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_provider_decrypt_key(uuid, text) TO service_role;

-- Also tighten the existing has_role to avoid public exec warnings (still needed by RLS via SECURITY DEFINER)
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
