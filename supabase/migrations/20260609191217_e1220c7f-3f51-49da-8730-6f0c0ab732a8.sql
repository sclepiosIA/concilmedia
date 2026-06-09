
CREATE TABLE public.prescription_omissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.episodes(id) ON DELETE CASCADE,
  traitement_id uuid NOT NULL REFERENCES public.traitements_habituels(id) ON DELETE CASCADE,
  justifiee boolean NOT NULL DEFAULT true,
  commentaire text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (episode_id, traitement_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prescription_omissions TO authenticated;
GRANT ALL ON public.prescription_omissions TO service_role;

ALTER TABLE public.prescription_omissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage prescription_omissions"
ON public.prescription_omissions
FOR ALL
TO authenticated
USING (public.owns_episode(episode_id))
WITH CHECK (public.owns_episode(episode_id));

CREATE TRIGGER set_updated_at_prescription_omissions
BEFORE UPDATE ON public.prescription_omissions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
