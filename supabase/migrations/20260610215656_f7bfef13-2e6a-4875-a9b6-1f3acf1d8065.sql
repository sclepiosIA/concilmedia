CREATE TABLE public.conciliation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  episode_id uuid REFERENCES public.episodes(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  step text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('enter','exit','heartbeat','action')),
  duration_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.conciliation_events TO authenticated;
GRANT ALL ON public.conciliation_events TO service_role;

ALTER TABLE public.conciliation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "events_insert_own"
  ON public.conciliation_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "events_select_own_or_org_or_admin"
  ON public.conciliation_events FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR (organization_id IS NOT NULL AND public.is_org_member(organization_id))
  );

CREATE INDEX idx_conc_events_org_time ON public.conciliation_events(organization_id, occurred_at DESC);
CREATE INDEX idx_conc_events_user_time ON public.conciliation_events(user_id, occurred_at DESC);
CREATE INDEX idx_conc_events_step_time ON public.conciliation_events(step, occurred_at DESC);
CREATE INDEX idx_conc_events_episode ON public.conciliation_events(episode_id);