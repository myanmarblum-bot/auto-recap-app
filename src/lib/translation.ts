import type { TranscriptSegment } from '../types';

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate`;

export interface TranslationResult {
  segments: TranscriptSegment[];
  targetLanguage: string;
}

/**
 * Translates transcript segments to the target language using Gemini via the edge function.
 * Preserves all segment IDs and timestamps — only the text is translated.
 */
export async function translateSegments(
  segments: TranscriptSegment[],
  targetLanguage: string,
  sourceLanguage?: string
): Promise<TranslationResult> {
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      segments: segments.map((s) => ({
        id: s.id,
        start: s.start,
        end: s.end,
        text: s.text,
      })),
      targetLanguage,
      sourceLanguage,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Translation failed (${res.status})`);
  }

  const data = await res.json();

  if (!data.segments || !Array.isArray(data.segments)) {
    throw new Error('Gemini returned an unexpected response format.');
  }

  const translated: TranscriptSegment[] = data.segments.map(
    (s: { id: string; start: number; end: number; text: string; translatedText?: string }) => ({
      id: s.id,
      start: s.start,
      end: s.end,
      text: s.text,
      translatedText: s.translatedText ?? s.text,
    })
  );

  return {
    segments: translated,
    targetLanguage: data.targetLanguage ?? targetLanguage,
  };
}
