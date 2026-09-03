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

const VOICE_OPTIONS_FOR_BURMESE: VoiceOption[] = [
  {
    id: 'thiri',
    name: 'Thiri',
    gender: 'female',
    language: 'Myanmar (Burmese)',
    languageCode: 'my-MM',
    description: 'Warm, clear Burmese narrator',
    pitch: 1.05,
    rate: 0.95,
    edgeVoice: 'my-MM-NilarNeural',
  },
  {
    id: 'aung',
    name: 'Aung',
    gender: 'male',
    language: 'Myanmar (Burmese)',
    languageCode: 'my-MM',
    description: 'Calm, articulate Burmese voice',
    pitch: 0.9,
    rate: 1.0,
    edgeVoice: 'my-MM-ThihaNeural',
  },
];

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
  return { buffer, detectedLanguage, voiceUsed };
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
}

/**
 * Generates TTS audio for each transcript segment individually.
 * Each segment gets its own audio buffer — NOT concatenated.
 * The sync step will place them on the timeline using transcript timestamps.
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

  let effectiveVoice = voice;
  if (detectedLanguage === 'my') {
    effectiveVoice =
      VOICE_OPTIONS_FOR_BURMESE.find((v) => v.gender === voice.gender) ??
      VOICE_OPTIONS_FOR_BURMESE[0];
  }

  const results: TTSSegmentResult[] = [];
  let voiceUsed = effectiveVoice.edgeVoice;

  for (let i = 0; i < validSegments.length; i++) {
    const seg = validSegments[i];
    const text = seg.translatedText ?? seg.text;

    const { buffer, voiceUsed: vv } = await callEdgeTTS(text, effectiveVoice, opts);
    voiceUsed = vv;

    const blob = new Blob([buffer], { type: 'audio/mpeg' });
    const audioUrl = URL.createObjectURL(blob);
    const durationSec = await getAudioDuration(audioUrl);

    results.push({
      segmentId: seg.id,
      start: seg.start,
      end: seg.end,
      text,
      audioBuffer: buffer,
      audioUrl,
      durationSec,
    });

    if (onProgress) {
      onProgress(Math.round(((i + 1) / validSegments.length) * 100));
    }
  }

  const totalDuration = results.reduce((sum, r) => sum + r.durationSec, 0);

  const debugInfo: TTSDebugEntry = {
    timestamp: new Date().toISOString(),
    detectedLanguage,
    selectedVoice: voiceUsed,
    audioDurationSec: totalDuration,
    textPreview: results[0]?.text.substring(0, 80) ?? '',
  };

  console.log('[TTS Debug]', {
    detectedLanguage,
    selectedVoice: voiceUsed,
    segmentCount: results.length,
    totalDuration,
    textPreview: results[0]?.text.substring(0, 100),
  });

  return { segments: results, detectedLanguage, voiceUsed, debugInfo };
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
  });
}
