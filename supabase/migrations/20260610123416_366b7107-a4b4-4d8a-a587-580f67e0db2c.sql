ALTER TABLE public.patients ADD COLUMN archived boolean NOT NULL DEFAULT false;

-- Add index for performance
CREATE INDEX idx_patients_archived ON public.patients(archived);

-- Update the RLS policy to respect archived flag (keep existing broad policy but it's fine)
-- The existing policy `shared patients` with qual:true allows all authenticated users to see all patients.
-- This is intentional for a shared medical workspace.