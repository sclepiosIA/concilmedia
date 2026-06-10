
-- Organizations and multi-tenant scaffolding for real-data ingestion (Piste #4)

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  finess text,
  hds_provider text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','pharmacien','observateur')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Security definer helpers to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.is_org_member(_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;

-- RLS policies
CREATE POLICY "Members can view their organizations"
  ON public.organizations FOR SELECT TO authenticated
  USING (public.is_org_member(id) OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Global admins manage organizations"
  ON public.organizations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Members can view memberships of their orgs"
  ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Org admins manage memberships"
  ON public.organization_members FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id) OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.is_org_admin(organization_id) OR public.has_role(auth.uid(),'admin'));

-- Data imports audit table
CREATE TABLE public.data_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  imported_by uuid NOT NULL,
  file_kind text NOT NULL CHECK (file_kind IN ('patients','traitements','prescriptions')),
  source_filename text,
  source_sha256 text NOT NULL,
  rows_total integer NOT NULL DEFAULT 0,
  rows_inserted integer NOT NULL DEFAULT 0,
  rows_rejected integer NOT NULL DEFAULT 0,
  errors jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','error')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(organization_id, file_kind, source_sha256)
);
GRANT SELECT, INSERT, UPDATE ON public.data_imports TO authenticated;
GRANT ALL ON public.data_imports TO service_role;
ALTER TABLE public.data_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org imports"
  ON public.data_imports FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Org admins write imports"
  ON public.data_imports FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id) OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Org admins update imports"
  ON public.data_imports FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id) OR public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_data_imports_org_started ON public.data_imports(organization_id, started_at DESC);

-- Provenance columns on patients (additive, backwards-compatible)
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_source text NOT NULL DEFAULT 'synthetic'
    CHECK (data_source IN ('synthetic','real_pseudonymized')),
  ADD COLUMN IF NOT EXISTS external_pseudo text,
  ADD COLUMN IF NOT EXISTS date_offset_days integer,
  ADD COLUMN IF NOT EXISTS imported_via uuid REFERENCES public.data_imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_org_source ON public.patients(organization_id, data_source);
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_org_pseudo
  ON public.patients(organization_id, external_pseudo)
  WHERE external_pseudo IS NOT NULL;

-- Tighten patients SELECT/UPDATE/DELETE policies: org-scoped for real data, legacy open for synthetic/null org
DROP POLICY IF EXISTS "auth can select patients" ON public.patients;
DROP POLICY IF EXISTS "auth can update patients" ON public.patients;
DROP POLICY IF EXISTS "auth can delete patients" ON public.patients;

CREATE POLICY "patients select scoped"
  ON public.patients FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR public.is_org_member(organization_id)
    OR public.has_role(auth.uid(),'admin')
  );

CREATE POLICY "patients update scoped"
  ON public.patients FOR UPDATE TO authenticated
  USING (
    organization_id IS NULL
    OR public.is_org_member(organization_id)
    OR public.has_role(auth.uid(),'admin')
  );

CREATE POLICY "patients delete scoped"
  ON public.patients FOR DELETE TO authenticated
  USING (
    organization_id IS NULL
    OR public.is_org_admin(organization_id)
    OR public.has_role(auth.uid(),'admin')
  );

-- updated_at triggers
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
