
-- Piste #9 v2: discharge letters versioning, delivery log, recipients on patients
ALTER TABLE public.discharge_letters
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_letter_id uuid NULL REFERENCES public.discharge_letters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS sent_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_channel text NULL,
  ADD COLUMN IF NOT EXISTS delivery_log jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Widen status to allow 'clos'
ALTER TABLE public.discharge_letters DROP CONSTRAINT IF EXISTS discharge_letters_status_check;
ALTER TABLE public.discharge_letters
  ADD CONSTRAINT discharge_letters_status_check
  CHECK (status IN ('brouillon','prete','envoyee','clos'));

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS medecin_traitant_nom text NULL,
  ADD COLUMN IF NOT EXISTS medecin_traitant_mssante text NULL,
  ADD COLUMN IF NOT EXISTS pharmacien_officine_nom text NULL,
  ADD COLUMN IF NOT EXISTS pharmacien_officine_mssante text NULL;
