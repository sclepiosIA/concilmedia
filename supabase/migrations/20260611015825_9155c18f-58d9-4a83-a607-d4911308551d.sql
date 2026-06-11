
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash text,
  hash text NOT NULL,
  seq bigserial NOT NULL
);

CREATE INDEX audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX audit_log_entity_idx ON public.audit_log (entity_type, entity_id);
CREATE INDEX audit_log_user_idx ON public.audit_log (user_id);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit_log"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Block all direct INSERT/UPDATE/DELETE from authenticated; only service_role + SECURITY DEFINER fn write.
CREATE OR REPLACE FUNCTION public.audit_log_block_mutations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only via append_audit_log()';
END;
$$;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_block_mutations();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_block_mutations();

-- Append fn: computes hash chain server-side. Callable by authenticated.
CREATE OR REPLACE FUNCTION public.append_audit_log(
  _action text,
  _entity_type text DEFAULT NULL,
  _entity_id text DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev text;
  _new_id uuid := gen_random_uuid();
  _now timestamptz := now();
  _uid uuid := auth.uid();
  _basis text;
  _hash text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'append_audit_log requires authenticated user';
  END IF;

  SELECT hash INTO _prev FROM public.audit_log ORDER BY seq DESC LIMIT 1;

  _basis := coalesce(_prev,'') || '|' || _new_id::text || '|' || _now::text
            || '|' || coalesce(_uid::text,'') || '|' || _action
            || '|' || coalesce(_entity_type,'') || '|' || coalesce(_entity_id,'')
            || '|' || coalesce(_payload::text,'{}');
  _hash := encode(digest(_basis, 'sha256'), 'hex');

  INSERT INTO public.audit_log (id, created_at, user_id, action, entity_type, entity_id, payload, prev_hash, hash)
  VALUES (_new_id, _now, _uid, _action, _entity_type, _entity_id, coalesce(_payload,'{}'::jsonb), _prev, _hash);

  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.append_audit_log(text, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.append_audit_log(text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_audit_log(text, text, text, jsonb) TO service_role;
