import type { VoiceOption } from '../types';

export const VOICE_OPTIONS: VoiceOption[] = [
  {
    id: 'aria',
    name: 'Aria',
    gender: 'female',
    language: 'English (US)',
    languageCode: 'en-US',
    description: 'Warm, expressive narrator',
    pitch: 1.0,
    rate: 1.0,
    edgeVoice: 'en-US-JennyNeural',
  },
  {
    id: 'jordan',
    name: 'Jordan',
    gender: 'male',
    language: 'English (US)',
    languageCode: 'en-US',
    description: 'Confident, clear delivery',
    pitch: 0.9,
    rate: 1.0,
    edgeVoice: 'en-US-GuyNeural',
  },
  {
    id: 'luna',
    name: 'Luna',
    gender: 'female',
    language: 'Spanish (ES)',
    languageCode: 'es-ES',
    description: 'Bright, friendly tone',
    pitch: 1.1,
    rate: 0.95,
    edgeVoice: 'es-ES-ElviraNeural',
  },
  {
    id: 'mateo',
    name: 'Mateo',
    gender: 'male',
    language: 'Spanish (ES)',
    languageCode: 'es-ES',
    description: 'Smooth, articulate baritone',
    pitch: 0.85,
    rate: 1.0,
    edgeVoice: 'es-ES-AlvaroNeural',
  },
  {
    id: 'yuki',
    name: 'Yuki',
    gender: 'female',
    language: 'Japanese',
    languageCode: 'ja-JP',
    description: 'Gentle, precise voice',
    pitch: 1.15,
    rate: 0.9,
    edgeVoice: 'ja-JP-NanamiNeural',
  },
  {
    id: 'kenji',
    name: 'Kenji',
    gender: 'male',
    language: 'Japanese',
    languageCode: 'ja-JP',
    description: 'Calm, authoritative',
    pitch: 0.8,
    rate: 1.0,
    edgeVoice: 'ja-JP-KeitaNeural',
  },
  {
    id: 'elise',
    name: 'Elise',
    gender: 'female',
    language: 'French (FR)',
    languageCode: 'fr-FR',
    description: 'Elegant, melodic',
    pitch: 1.05,
    rate: 1.0,
    edgeVoice: 'fr-FR-DeniseNeural',
  },
  {
    id: 'lucas',
    name: 'Lucas',
    gender: 'male',
    language: 'French (FR)',
    languageCode: 'fr-FR',
    description: 'Rich, conversational',
    pitch: 0.88,
    rate: 1.0,
    edgeVoice: 'fr-FR-HenriNeural',
  },
  {
    id: 'amelie',
    name: 'Amelie',
    gender: 'female',
    language: 'German',
    languageCode: 'de-DE',
    description: 'Professional, steady',
    pitch: 1.0,
    rate: 1.0,
    edgeVoice: 'de-DE-KatjaNeural',
  },
  {
    id: 'felix',
    name: 'Felix',
    gender: 'male',
    language: 'German',
    languageCode: 'de-DE',
    description: 'Crisp, energetic',
    pitch: 0.92,
    rate: 1.05,
    edgeVoice: 'de-DE-ConradNeural',
  },
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

export const LANGUAGES = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'pt-BR', name: 'Portuguese (BR)' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'zh-CN', name: 'Chinese (Mandarin)' },
  { code: 'ar-SA', name: 'Arabic' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'ru-RU', name: 'Russian' },
  { code: 'tr-TR', name: 'Turkish' },
  { code: 'my', name: 'Myanmar (Burmese)' },
];

export const ACCEPTED_FORMATS = ['.mp4', '.mov', '.avi', '.mkv'];
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatTranscript(segments: { start: number; text: string }[]): string {
  return segments
    .map((s) => `[${formatTimecode(s.start)}]\n${s.text.trim()}`)
    .join('\n');
}

export function parseTranscript(text: string): { start: number; text: string }[] {
  const lines = text.split('\n');
  const segments: { start: number; text: string }[] = [];
  let currentTime = 0;
  let currentText: string[] = [];

  const timecodeRegex = /\[(\d{2}):(\d{2}):(\d{2})\]/;

  for (const line of lines) {
    const match = line.trim().match(timecodeRegex);
    if (match) {
      if (currentText.length > 0) {
        segments.push({ start: currentTime, text: currentText.join(' ').trim() });
        currentText = [];
      }
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const s = parseInt(match[3], 10);
      currentTime = h * 3600 + m * 60 + s;
    } else if (line.trim()) {
      currentText.push(line.trim());
    }
  }
  if (currentText.length > 0) {
    segments.push({ start: currentTime, text: currentText.join(' ').trim() });
  }
  return segments;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
