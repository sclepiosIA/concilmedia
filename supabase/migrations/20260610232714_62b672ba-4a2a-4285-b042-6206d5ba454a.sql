
ALTER TABLE public.episodes
  ADD COLUMN IF NOT EXISTS discharge_conciliation_completed_at timestamptz NULL;

CREATE TABLE IF NOT EXISTS public.discharge_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  organization_id uuid NULL REFERENCES public.organizations(id) ON DELETE SET NULL,
  comparison_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  letter_html text NULL,
  letter_text text NULL,
  recipient_medecin_nom text NULL,
  recipient_medecin_mssante text NULL,
  recipient_pharmacien_nom text NULL,
  recipient_pharmacien_mssante text NULL,
  status text NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','prete','envoyee')),
  sent_at timestamptz NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discharge_letters_episode ON public.discharge_letters(episode_id);
CREATE INDEX IF NOT EXISTS idx_discharge_letters_patient ON public.discharge_letters(patient_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discharge_letters TO authenticated;
GRANT ALL ON public.discharge_letters TO service_role;

ALTER TABLE public.discharge_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discharge_letters org members read"
  ON public.discharge_letters FOR SELECT TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id));

CREATE POLICY "discharge_letters org members insert"
  ON public.discharge_letters FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NULL OR public.is_org_member(organization_id));

CREATE POLICY "discharge_letters org members update"
  ON public.discharge_letters FOR UPDATE TO authenticated
  USING (organization_id IS NULL OR public.is_org_member(organization_id))
  WITH CHECK (organization_id IS NULL OR public.is_org_member(organization_id));

CREATE POLICY "discharge_letters org admins delete"
  ON public.discharge_letters FOR DELETE TO authenticated
  USING (organization_id IS NULL OR public.is_org_admin(organization_id));

CREATE OR REPLACE FUNCTION public.set_updated_at_discharge_letters()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_discharge_letters_updated_at
  BEFORE UPDATE ON public.discharge_letters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_discharge_letters();
