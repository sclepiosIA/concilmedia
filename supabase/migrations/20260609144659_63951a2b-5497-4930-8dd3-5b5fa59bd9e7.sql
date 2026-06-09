
CREATE TABLE public.documents_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  episode_id uuid REFERENCES public.episodes(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size integer,
  hash_sha256 text,
  document_type text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_sources_patient ON public.documents_sources(patient_id);
CREATE INDEX idx_documents_sources_episode ON public.documents_sources(episode_id);
CREATE INDEX idx_documents_sources_hash ON public.documents_sources(hash_sha256);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents_sources TO authenticated;
GRANT ALL ON public.documents_sources TO service_role;

ALTER TABLE public.documents_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage source documents"
  ON public.documents_sources FOR ALL
  TO authenticated
  USING (public.owns_patient(patient_id))
  WITH CHECK (public.owns_patient(patient_id));

ALTER TABLE public.traitements_habituels
  ADD COLUMN source_document_id uuid REFERENCES public.documents_sources(id) ON DELETE SET NULL;
ALTER TABLE public.prescriptions_hospitalieres
  ADD COLUMN source_document_id uuid REFERENCES public.documents_sources(id) ON DELETE SET NULL;
ALTER TABLE public.allergies
  ADD COLUMN source_document_id uuid REFERENCES public.documents_sources(id) ON DELETE SET NULL;
ALTER TABLE public.antecedents
  ADD COLUMN source_document_id uuid REFERENCES public.documents_sources(id) ON DELETE SET NULL;
ALTER TABLE public.comorbidites
  ADD COLUMN source_document_id uuid REFERENCES public.documents_sources(id) ON DELETE SET NULL;
ALTER TABLE public.biologie_resultats
  ADD COLUMN source_document_id uuid REFERENCES public.documents_sources(id) ON DELETE SET NULL;

-- RLS storage policies for the ordonnances bucket (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='ordonnances_authenticated_read') THEN
    CREATE POLICY "ordonnances_authenticated_read"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'ordonnances' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='ordonnances_authenticated_insert') THEN
    CREATE POLICY "ordonnances_authenticated_insert"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'ordonnances' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='ordonnances_authenticated_delete') THEN
    CREATE POLICY "ordonnances_authenticated_delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'ordonnances' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;
