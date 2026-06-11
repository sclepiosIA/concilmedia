
-- Piste #10 v2 — DMP/MES: adhérence, push MES simulé, audit, consentement

-- 1) Adherence snapshots
CREATE TABLE public.hmd_adherence_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  import_id uuid REFERENCES public.dmp_hmd_imports(id) ON DELETE SET NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  window_months int NOT NULL DEFAULT 6,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  discrepancies jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX idx_hmd_adh_patient ON public.hmd_adherence_snapshots(patient_id, computed_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hmd_adherence_snapshots TO authenticated;
GRANT ALL ON public.hmd_adherence_snapshots TO service_role;
ALTER TABLE public.hmd_adherence_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read hmd adh" ON public.hmd_adherence_snapshots FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth insert hmd adh" ON public.hmd_adherence_snapshots FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth delete hmd adh" ON public.hmd_adherence_snapshots FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- 2) MES pushes
CREATE TABLE public.mes_pushes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  episode_id uuid REFERENCES public.episodes(id) ON DELETE SET NULL,
  document_type text NOT NULL CHECK (document_type IN ('lettre_liaison','bcm','plan_pharmaceutique')),
  document_id uuid,
  status text NOT NULL DEFAULT 'envoye' CHECK (status IN ('envoye','accepte','rejete','simulated')),
  ack_id text,
  payload_hash text,
  payload_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  pushed_at timestamptz NOT NULL DEFAULT now(),
  pushed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error_message text
);
CREATE INDEX idx_mes_pushes_patient ON public.mes_pushes(patient_id, pushed_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mes_pushes TO authenticated;
GRANT ALL ON public.mes_pushes TO service_role;
ALTER TABLE public.mes_pushes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read mes" ON public.mes_pushes FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth insert mes" ON public.mes_pushes FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- 3) DMP access audit
CREATE TABLE public.dmp_access_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource text,
  motif text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dmp_audit_patient ON public.dmp_access_audit(patient_id, created_at DESC);
GRANT SELECT, INSERT ON public.dmp_access_audit TO authenticated;
GRANT ALL ON public.dmp_access_audit TO service_role;
ALTER TABLE public.dmp_access_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read audit" ON public.dmp_access_audit FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth insert audit" ON public.dmp_access_audit FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- 4) Consentement DMP sur patients
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS consentement_dmp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consentement_dmp_date timestamptz,
  ADD COLUMN IF NOT EXISTS consentement_dmp_recueilli_par uuid REFERENCES auth.users(id) ON DELETE SET NULL;
