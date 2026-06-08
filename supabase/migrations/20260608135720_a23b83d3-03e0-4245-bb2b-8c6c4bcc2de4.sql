
-- Extensions for memoir prototype
ALTER TABLE public.conciliation_medicaments
  ADD COLUMN IF NOT EXISTS gravite text CHECK (gravite IN ('mineur','modere','majeur','critique')),
  ADD COLUMN IF NOT EXISTS classe_atc text,
  ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cohort_tag text;

ALTER TABLE public.episodes
  ADD COLUMN IF NOT EXISTS via_urgences boolean NOT NULL DEFAULT false;

-- Risk scores table
CREATE TABLE IF NOT EXISTS public.risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  niveau text NOT NULL CHECK (niveau IN ('faible','modere','eleve','critique')),
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_adjustment text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_scores TO authenticated;
GRANT ALL ON public.risk_scores TO service_role;
ALTER TABLE public.risk_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage risk_scores" ON public.risk_scores
  FOR ALL TO authenticated
  USING (public.owns_episode(episode_id))
  WITH CHECK (public.owns_episode(episode_id));

CREATE INDEX IF NOT EXISTS idx_risk_scores_episode ON public.risk_scores(episode_id, computed_at DESC);

-- Ground truth DNIs for synthetic dataset evaluation
CREATE TABLE IF NOT EXISTS public.ground_truth_dnis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  medicament text NOT NULL,
  type_divergence text NOT NULL CHECK (type_divergence IN ('omission','ajout','modification_dose','modification_freq','duplication')),
  expected_intention text NOT NULL DEFAULT 'non_intentionnel',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ground_truth_dnis TO authenticated;
GRANT ALL ON public.ground_truth_dnis TO service_role;
ALTER TABLE public.ground_truth_dnis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners manage ground_truth" ON public.ground_truth_dnis
  FOR ALL TO authenticated
  USING (public.owns_episode(episode_id))
  WITH CHECK (public.owns_episode(episode_id));

CREATE INDEX IF NOT EXISTS idx_gt_episode ON public.ground_truth_dnis(episode_id);
