export interface TranscriptSegment {
  id: string;
  start: number; // seconds
  end: number; // seconds
  text: string;
  translatedText?: string;
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'male' | 'female';
  language: string;
  languageCode: string;
  description: string;
  pitch: number;
  rate: number;
  edgeVoice: string;
}

export interface TTSDebugEntry {
  timestamp: string;
  detectedLanguage: string;
  selectedVoice: string;
  actualVoiceUsed: string;
  voiceMatched: boolean;
  audioDurationSec: number;
  segmentCount: number;
  textPreview: string;
}

export type WorkflowStep =
  | 'upload'
  | 'transcribe'
  | 'translate'
  | 'voice-removal'
  | 'tts'
  | 'sync'
  | 'export';

export type StepStatus = 'pending' | 'active' | 'processing' | 'completed' | 'error';

export interface StepState {
  id: WorkflowStep;
  label: string;
  status: StepStatus;
  progress: number; // 0-100
}

export interface ProcessingResult {
  audioUrl?: string;
  videoUrl?: string;
  transcriptUrl?: string;
}

export interface VoiceRemovalResult {
  cleanedAudioUrl: string;
  cleanedAudioBlob: Blob;
  durationSec: number;
}
