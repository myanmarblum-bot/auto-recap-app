import type { VoiceOption, TranscriptSegment, TTSDebugEntry } from '../types';

export interface TTSOptions {
  speed?: number;
  volume?: number;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Burmese Unicode range: U+1000–U+109F
const BURMESE_REGEX = /[\u1000-\u109F]/;

export function isBurmeseText(text: string): boolean {
  return BURMESE_REGEX.test(text);
}

export function detectLanguage(text: string): string {
  if (/[\u1000-\u109F]/.test(text)) return 'my';
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/[\u0400-\u04FF]/.test(text)) return 'ru';
  return 'en';
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && !!window.speechSynthesis;
}

export function isAudioCaptureSupported(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';
}

let currentPreviewAudio: HTMLAudioElement | null = null;

export function stopSpeaking(): void {
  if (currentPreviewAudio) {
    currentPreviewAudio.pause();
    currentPreviewAudio = null;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function callEdgeTTS(
  text: string,
  voice: VoiceOption,
  opts?: TTSOptions
): Promise<{ buffer: ArrayBuffer; detectedLanguage: string; voiceUsed: string }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase configuration. Cannot call TTS service.');
  }

  const apiUrl = `${SUPABASE_URL}/functions/v1/tts`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice: voice.edgeVoice,
      speed: opts?.speed ?? voice.rate,
      pitch: voice.pitch,
      volume: opts?.volume ?? 1,
    }),
  });

  if (!response.ok) {
    let errorMsg = `TTS service returned status ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody?.error) errorMsg = errBody.error;
    } catch {
      // response wasn't JSON
    }
    throw new Error(errorMsg);
  }

  const detectedLanguage = response.headers.get('X-Detected-Language') || detectLanguage(text);
  const voiceUsed = response.headers.get('X-Voice-Used') || voice.edgeVoice;

  const buffer = await response.arrayBuffer();

  if (buffer.byteLength === 0) {
    throw new Error('TTS service returned empty audio data.');
  }

  return { buffer, detectedLanguage, voiceUsed };
}

/**
 * Calls Edge TTS with retry logic. Retries up to MAX_RETRIES times
 * with exponential backoff. This prevents single-segment failures
 * from dropping entire transcript segments.
 */
async function callEdgeTTSWithRetry(
  text: string,
  voice: VoiceOption,
  opts?: TTSOptions,
  attempt = 1
): Promise<{ buffer: ArrayBuffer; detectedLanguage: string; voiceUsed: string }> {
  try {
    return await callEdgeTTS(text, voice, opts);
  } catch (err) {
    if (attempt >= MAX_RETRIES) {
      throw err;
    }
    const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
    console.warn(`[TTS] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms:`, err instanceof Error ? err.message : err);
    await sleep(delay);
    return callEdgeTTSWithRetry(text, voice, opts, attempt + 1);
  }
}

export async function speakPreview(
  voice: VoiceOption,
  sampleText?: string,
  opts?: TTSOptions
): Promise<{ detectedLanguage: string; voiceUsed: string }> {
  stopSpeaking();

  const defaultSample = isBurmeseText(voice.languageCode) || voice.languageCode.startsWith('my')
    ? 'မင်္ဂလာပါ။ ဒါဟာ မြန်မာအသံ စမ်းသပ်မှု ဖြစ်ပါတယ်။'
    : `Hello, I'm ${voice.name}. This is a preview of my voice.`;

  const text = sampleText ?? defaultSample;

  try {
    const { buffer, detectedLanguage, voiceUsed } = await callEdgeTTS(text, voice, opts);
    const blob = new Blob([buffer], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentPreviewAudio = audio;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      currentPreviewAudio = null;
    };
    await audio.play();
    return { detectedLanguage, voiceUsed };
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `Voice preview failed: ${err.message}`
        : 'Voice preview failed. Please try again.'
    );
  }
}

export interface TTSSegmentResult {
  segmentId: string;
  start: number;
  end: number;
  text: string;
  audioBuffer: ArrayBuffer;
  audioUrl: string;
  durationSec: number;
}

export interface TTSGenerationResult {
  segments: TTSSegmentResult[];
  detectedLanguage: string;
  voiceUsed: string;
  debugInfo: TTSDebugEntry;
  failedSegments: { segmentId: string; text: string; error: string }[];
}

// Concurrency limit for parallel TTS calls
const CONCURRENCY = 3;

/**
 * Generates TTS audio for each transcript segment individually.
 * Each segment gets its own audio buffer — NOT concatenated.
 * The sync step will place them on the timeline using transcript timestamps.
 *
 * Uses bounded concurrency (3 parallel requests) and per-segment retry
 * to ensure every segment gets audio. Failed segments are collected
 * and reported, not silently dropped.
 */
export async function generateTTSSegments(
  segments: TranscriptSegment[],
  voice: VoiceOption,
  onProgress?: (percent: number) => void,
  opts?: TTSOptions
): Promise<TTSGenerationResult> {
  const validSegments = segments.filter((s) => {
    const text = (s.translatedText ?? s.text).trim();
    return text.length > 0;
  });

  if (validSegments.length === 0) {
    throw new Error('No text to synthesize. Please translate the transcript first.');
  }

  const combinedText = validSegments.map((s) => s.translatedText ?? s.text).join(' ');
  const detectedLanguage = detectLanguage(combinedText);

  // Use the user's selected voice directly — never override it.
  // If the text language doesn't match the voice language, warn but proceed.
  const effectiveVoice = voice;
  const voiceLangPrefix = effectiveVoice.languageCode.slice(0, 2).toLowerCase();
  if (detectedLanguage !== 'en' && voiceLangPrefix !== detectedLanguage) {
    console.warn(
      `[TTS] Language mismatch: text is ${detectedLanguage}, voice is ${effectiveVoice.languageCode}. ` +
      `The selected voice may not pronounce the text correctly.`
    );
  }

  const failedSegments: { segmentId: string; text: string; error: string }[] = [];
  const results: TTSSegmentResult[] = new Array(validSegments.length);
  let voiceUsed = effectiveVoice.edgeVoice;
  let completedCount = 0;

  // Process segments with bounded concurrency
  for (let i = 0; i < validSegments.length; i += CONCURRENCY) {
    const batch = validSegments.slice(i, i + CONCURRENCY);
    const batchIndices = batch.map((_, j) => i + j);

    const batchResults = await Promise.allSettled(
      batch.map(async (seg) => {
        const text = seg.translatedText ?? seg.text;
        const { buffer, voiceUsed: vv } = await callEdgeTTSWithRetry(text, effectiveVoice, opts);
        voiceUsed = vv;

        const blob = new Blob([buffer], { type: 'audio/mpeg' });
        const audioUrl = URL.createObjectURL(blob);
        const durationSec = await getAudioDuration(audioUrl);

        return {
          segmentId: seg.id,
          start: seg.start,
          end: seg.end,
          text,
          audioBuffer: buffer,
          audioUrl,
          durationSec,
        };
      })
    );

    batchResults.forEach((result, j) => {
      const idx = batchIndices[j];
      if (result.status === 'fulfilled') {
        results[idx] = result.value;
      } else {
        const seg = batch[j];
        const errorMsg = result.reason instanceof Error ? result.reason.message : 'Unknown error';
        console.error(`[TTS] Segment ${seg.id} failed after ${MAX_RETRIES} retries:`, errorMsg);
        failedSegments.push({
          segmentId: seg.id,
          text: (seg.translatedText ?? seg.text).substring(0, 80),
          error: errorMsg,
        });
      }
      completedCount++;
      if (onProgress) {
        onProgress(Math.round((completedCount / validSegments.length) * 100));
      }
    });
  }

  // Filter out any null slots from failed segments
  const successfulResults = results.filter((r): r is TTSSegmentResult => r !== null);

  if (successfulResults.length === 0) {
    throw new Error(
      `All ${validSegments.length} segments failed to generate. Last error: ${failedSegments[0]?.error ?? 'unknown'}`
    );
  }

  const totalDuration = successfulResults.reduce((sum, r) => sum + r.durationSec, 0);

  const voiceMatched = voiceUsed === effectiveVoice.edgeVoice;

  const debugInfo: TTSDebugEntry = {
    timestamp: new Date().toISOString(),
    detectedLanguage,
    selectedVoice: effectiveVoice.edgeVoice,
    actualVoiceUsed: voiceUsed,
    voiceMatched,
    audioDurationSec: totalDuration,
    segmentCount: successfulResults.length,
    textPreview: successfulResults[0]?.text.substring(0, 80) ?? '',
  };

  console.log('[TTS Debug]', {
    detectedLanguage,
    selectedVoice: effectiveVoice.edgeVoice,
    actualVoiceUsed: voiceUsed,
    voiceMatched,
    segmentCount: successfulResults.length,
    failedCount: failedSegments.length,
    totalDuration,
    textPreview: successfulResults[0]?.text.substring(0, 100),
  });

  if (failedSegments.length > 0) {
    console.warn(`[TTS] ${failedSegments.length}/${validSegments.length} segments failed:`, failedSegments);
  }

  return { segments: successfulResults, detectedLanguage, voiceUsed, debugInfo, failedSegments };
}

/**
 * Legacy function — generates one continuous audio track by concatenating segments.
 * Kept for backward compatibility with the preview audio button.
 */
export async function generateTTSAudio(
  segments: TranscriptSegment[],
  voice: VoiceOption,
  onProgress?: (percent: number) => void,
  opts?: TTSOptions
): Promise<{
  audioUrl: string;
  blob: Blob;
  durationSec: number;
  fileCaptured: boolean;
  debugInfo: TTSDebugEntry;
}> {
  const { segments: ttsSegments, debugInfo } = await generateTTSSegments(
    segments,
    voice,
    onProgress,
    opts
  );

  const totalLength = ttsSegments.reduce((sum, s) => sum + s.audioBuffer.byteLength, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const seg of ttsSegments) {
    merged.set(new Uint8Array(seg.audioBuffer), offset);
    offset += seg.audioBuffer.byteLength;
  }

  const blob = new Blob([merged], { type: 'audio/mpeg' });
  const audioUrl = URL.createObjectURL(blob);
  const durationSec = await getAudioDuration(audioUrl);

  return {
    audioUrl,
    blob,
    durationSec,
    fileCaptured: true,
    debugInfo: { ...debugInfo, audioDurationSec: durationSec },
  };
}

function getAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      resolve(audio.duration || 0);
    });
    audio.addEventListener('error', () => resolve(0));
    // Safety timeout — some blobs don't fire loadedmetadata
    setTimeout(() => resolve(0), 5000);
  });
}
