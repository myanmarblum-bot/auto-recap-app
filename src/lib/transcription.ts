import { supabase } from './supabase';
import type { TranscriptSegment } from '../types';
import { generateId } from './constants';

export interface AssemblyAIResult {
  segments: TranscriptSegment[];
  text: string;
  languageCode: string | null;
  audioDuration: number | null;
}

interface SubmitResponse {
  id: string;
  status: string;
}

interface PollResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  text?: string;
  language_code?: string;
  audio_duration?: number;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
    speaker?: string;
    confidence?: number;
  }>;
  error?: string;
}

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe`;

/**
 * Uploads a video file to Supabase Storage and returns a public URL.
 */
export async function uploadVideoToStorage(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'mp4';
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  // Supabase JS v2 upload doesn't support progress callbacks natively,
  // so we simulate progress alongside the upload for UX.
  let progressInterval: ReturnType<typeof setInterval> | null = null;
  if (onProgress) {
    let simulated = 0;
    progressInterval = setInterval(() => {
      simulated = Math.min(simulated + Math.random() * 12 + 5, 92);
      onProgress(simulated);
    }, 150);
  }

  try {
    const { data, error } = await supabase.storage
      .from('videos')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'video/mp4',
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('videos')
      .getPublicUrl(data.path);

    if (onProgress) onProgress(100);
    return urlData.publicUrl;
  } finally {
    if (progressInterval) clearInterval(progressInterval);
  }
}

/**
 * Deletes a video file from Supabase Storage (cleanup).
 */
export async function deleteVideoFromStorage(publicUrl: string): Promise<void> {
  try {
    const url = new URL(publicUrl);
    const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/videos\/(.+)$/);
    const filePath = pathMatch?.[1] ?? url.pathname.split('/videos/').pop();
    if (!filePath) return;
    await supabase.storage.from('videos').remove([decodeURIComponent(filePath)]);
  } catch {
    // Best-effort cleanup — ignore errors
  }
}

/**
 * Submits a transcription job to AssemblyAI via the edge function.
 */
export async function submitTranscription(
  audioUrl: string,
  languageCode?: string
): Promise<SubmitResponse> {
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ audio_url: audioUrl, language_code: languageCode }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to submit transcription (${res.status})`);
  }

  const data = await res.json();
  return { id: data.id, status: data.status };
}

/**
 * Polls the transcription status until completion or error.
 * Calls onStatus with each poll result.
 */
export async function pollTranscription(
  transcriptId: string,
  onStatus: (status: PollResponse) => void,
  options?: { intervalMs?: number; maxAttempts?: number }
): Promise<AssemblyAIResult> {
  const intervalMs = options?.intervalMs ?? 3000;
  const maxAttempts = options?.maxAttempts ?? 100;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`${EDGE_FUNCTION_URL}/${transcriptId}`, {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Polling failed (${res.status})`);
    }

    const data: PollResponse = await res.json();
    onStatus(data);

    if (data.status === 'completed') {
      const segments: TranscriptSegment[] = (data.segments ?? []).map((s) => ({
        id: generateId(),
        start: s.start,
        end: s.end,
        text: s.text,
      }));
      return {
        segments,
        text: data.text ?? '',
        languageCode: data.language_code ?? null,
        audioDuration: data.audio_duration ?? null,
      };
    }

    if (data.status === 'error') {
      throw new Error(data.error || 'Transcription failed on AssemblyAI.');
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('Transcription timed out. Please try again with a shorter video.');
}

/**
 * Full transcription flow: submit, then poll until complete.
 */
export async function transcribeVideo(
  audioUrl: string,
  callbacks: {
    onSubmit?: (id: string) => void;
    onPoll?: (status: string) => void;
  },
  languageCode?: string
): Promise<AssemblyAIResult> {
  const submitResult = await submitTranscription(audioUrl, languageCode);
  callbacks.onSubmit?.(submitResult.id);

  return pollTranscription(submitResult.id, (data) => {
    callbacks.onPoll?.(data.status);
  });
}
