
CREATE POLICY "users read own ordonnances" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'ordonnances' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "users insert own ordonnances" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ordonnances' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "users update own ordonnances" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'ordonnances' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "users delete own ordonnances" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'ordonnances' AND (storage.foldername(name))[1] = auth.uid()::text);
