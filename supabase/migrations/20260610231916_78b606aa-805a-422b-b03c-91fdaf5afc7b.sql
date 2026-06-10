-- Piste #8 — Team workflow (assignation, transferts, supervision)

-- 1) Extend organization_members
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS service text,
  ADD COLUMN IF NOT EXISTS display_name text;

-- 2) Extend patients (additive)
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service text,
  ADD COLUMN IF NOT EXISTS workflow_status text NOT NULL DEFAULT 'a_faire'
    CHECK (workflow_status IN ('a_faire','en_cours','en_attente_validation','valide','clos'));

CREATE INDEX IF NOT EXISTS idx_patients_workflow
  ON public.patients(organization_id, workflow_status, assigned_to);
CREATE INDEX IF NOT EXISTS idx_patients_assigned ON public.patients(assigned_to);

-- 3) Transfers history
CREATE TABLE IF NOT EXISTS public.conciliation_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  from_user_id uuid,
  to_user_id uuid,
  motif text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.conciliation_transfers TO authenticated;
GRANT ALL ON public.conciliation_transfers TO service_role;
ALTER TABLE public.conciliation_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view org transfers"
  ON public.conciliation_transfers FOR SELECT TO authenticated
  USING (
    organization_id IS NULL
    OR public.is_org_member(organization_id)
    OR public.has_role(auth.uid(),'admin')
  );

CREATE POLICY "members insert org transfers"
  ON public.conciliation_transfers FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NULL
    OR public.is_org_member(organization_id)
    OR public.has_role(auth.uid(),'admin')
  );

CREATE INDEX IF NOT EXISTS idx_transfers_patient_created
  ON public.conciliation_transfers(patient_id, created_at DESC);
