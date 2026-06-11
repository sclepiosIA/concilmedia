
CREATE TABLE public.dmp_hmd_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('dmp_simule','csv_manuel','json_manuel')),
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  period_start date NULL,
  period_end date NULL,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  reconciliation jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'a_rapprocher' CHECK (status IN ('a_rapprocher','rapproche','archive')),
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dmp_hmd_imports TO authenticated;
GRANT ALL ON public.dmp_hmd_imports TO service_role;

ALTER TABLE public.dmp_hmd_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can manage HMD imports of their patients"
  ON public.dmp_hmd_imports
  FOR ALL
  TO authenticated
  USING (public.owns_patient(patient_id))
  WITH CHECK (public.owns_patient(patient_id));

CREATE INDEX idx_dmp_hmd_imports_patient ON public.dmp_hmd_imports(patient_id, imported_at DESC);

CREATE TRIGGER trg_dmp_hmd_imports_updated_at
  BEFORE UPDATE ON public.dmp_hmd_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
