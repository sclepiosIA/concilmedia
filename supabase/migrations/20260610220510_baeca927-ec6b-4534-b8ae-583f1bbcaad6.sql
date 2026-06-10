-- Piste #6 v2 : SIH config, push logs, INS pseudo, FHIR ingest secret

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS fhir_ingest_secret_encrypted bytea;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS ins_pseudo text,
  ADD COLUMN IF NOT EXISTS ipp_authority_oid text;

CREATE UNIQUE INDEX IF NOT EXISTS patients_org_ins_pseudo_uniq
  ON public.patients(organization_id, ins_pseudo) WHERE ins_pseudo IS NOT NULL;

-- organization_sih_config
CREATE TABLE IF NOT EXISTS public.organization_sih_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  fhir_base_url text,
  auth_kind text NOT NULL DEFAULT 'none' CHECK (auth_kind IN ('none','bearer','hmac')),
  auth_secret_encrypted bytea,
  ins_oid text,
  ipp_authority_oid text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_sih_config TO authenticated;
GRANT ALL ON public.organization_sih_config TO service_role;
ALTER TABLE public.organization_sih_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sih_config_admin_select" ON public.organization_sih_config
  FOR SELECT TO authenticated USING (public.is_org_admin(organization_id));
CREATE POLICY "sih_config_admin_modify" ON public.organization_sih_config
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE TRIGGER set_sih_config_updated_at
  BEFORE UPDATE ON public.organization_sih_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- fhir_push_logs
CREATE TABLE IF NOT EXISTS public.fhir_push_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  validation_id uuid REFERENCES public.conciliation_validations(id) ON DELETE SET NULL,
  endpoint_url text NOT NULL,
  status_code int,
  ok boolean NOT NULL DEFAULT false,
  response_excerpt text,
  resource_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  pushed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fhir_push_logs_org_created_idx
  ON public.fhir_push_logs(organization_id, created_at DESC);

GRANT SELECT, INSERT ON public.fhir_push_logs TO authenticated;
GRANT ALL ON public.fhir_push_logs TO service_role;
ALTER TABLE public.fhir_push_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fhir_push_logs_member_select" ON public.fhir_push_logs
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY "fhir_push_logs_admin_insert" ON public.fhir_push_logs
  FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));