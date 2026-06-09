ALTER TABLE public.prescriptions_hospitalieres
  ADD COLUMN IF NOT EXISTS match_status text,
  ADD COLUMN IF NOT EXISTS match_reason text,
  ADD COLUMN IF NOT EXISTS match_source text,
  ADD COLUMN IF NOT EXISTS match_recommandation text,
  ADD COLUMN IF NOT EXISTS match_analyzed_at timestamptz;