ALTER TABLE public.prescriptions_hospitalieres
  ADD COLUMN IF NOT EXISTS nom_commercial TEXT,
  ADD COLUMN IF NOT EXISTS dosage_unite TEXT,
  ADD COLUMN IF NOT EXISTS posologie_matin TEXT,
  ADD COLUMN IF NOT EXISTS posologie_midi TEXT,
  ADD COLUMN IF NOT EXISTS posologie_soir TEXT,
  ADD COLUMN IF NOT EXISTS posologie_coucher TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT;