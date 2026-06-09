
ALTER TABLE public.traitements_habituels
  ADD COLUMN IF NOT EXISTS duree text,
  ADD COLUMN IF NOT EXISTS posologie_texte text;
