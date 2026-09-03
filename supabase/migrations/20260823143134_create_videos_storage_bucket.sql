/*
# Create public videos storage bucket for video uploads

1. New Storage Bucket
- `videos` bucket (public) — stores uploaded video files before transcription.
- Files are stored with unique names and are publicly readable so AssemblyAI
  can fetch them from the Supabase CDN.

2. Security
- Public bucket: anyone can read objects (required for AssemblyAI to fetch the file).
- Anon + authenticated can upload and delete objects (no sign-in in this app).
- Storage policies scoped to the `videos` bucket.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('videos', 'videos', true)
ON CONFLICT (id) DO NOTHING;
