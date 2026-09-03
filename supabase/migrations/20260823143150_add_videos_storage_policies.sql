/*
# Add storage policies for videos bucket

1. Security
- Public read access for videos bucket (AssemblyAI needs to fetch the file).
- Anon + authenticated can upload and delete (no sign-in app).
*/

DROP POLICY IF EXISTS "anon_select_videos" ON storage.objects;
CREATE POLICY "anon_select_videos" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'videos');

DROP POLICY IF EXISTS "anon_insert_videos" ON storage.objects;
CREATE POLICY "anon_insert_videos" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'videos');

DROP POLICY IF EXISTS "anon_delete_videos" ON storage.objects;
CREATE POLICY "anon_delete_videos" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'videos');
