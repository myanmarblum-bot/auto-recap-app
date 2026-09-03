import { useCallback, useRef, useState } from 'react';
import type { StepState, StepStatus, TranscriptSegment, WorkflowStep, TTSDebugEntry } from '../types';
import type { TTSSegmentResult } from '../lib/tts';
import { VOICE_OPTIONS } from '../lib/constants';


const STEP_ORDER: { id: WorkflowStep; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'transcribe', label: 'Transcribe' },
  { id: 'translate', label: 'Translate' },
  { id: 'voice-removal', label: 'Voice Removal' },
  { id: 'tts', label: 'AI Voice' },
  { id: 'sync', label: 'Sync' },
  { id: 'export', label: 'Export' },
];

const INITIAL_STEPS: StepState[] = STEP_ORDER.map((s) => ({
  id: s.id,
  label: s.label,
  status: 'pending',
  progress: 0,
}));

interface WorkflowState {
  steps: StepState[];
  videoFile: File | null;
  videoUrl: string | null;
  videoStorageUrl: string | null;
  transcript: TranscriptSegment[];
  translatedTranscript: TranscriptSegment[];
  selectedVoiceId: string;
  targetLanguage: string;
  transcriptionStatus: string;
  voiceRemovalProgress: number;
  ttsProgress: number;
  syncProgress: number;
  exportProgress: number;
  finalVideoUrl: string | null;
  finalVideoBlob: Blob | null;
  finalVideoSize: number;
  finalVideoDuration: number;
  finalVideoExtension: string;
  generatedAudioUrl: string | null;
  cleanedAudioUrl: string | null;
  ttsSegments: TTSSegmentResult[];
  syncedAudioUrl: string | null;
  voiceSpeed: number;
  voiceVolume: number;
  ttsDebugInfo: TTSDebugEntry | null;
  error: string | null;
}

function createStepsWithActive(activeId: WorkflowStep): StepState[] {
  const activeIdx = STEP_ORDER.findIndex((s) => s.id === activeId);
  return STEP_ORDER.map((s, idx) => ({
    id: s.id,
    label: s.label,
    status: idx < activeIdx ? 'completed' : idx === activeIdx ? 'active' : 'pending',
    progress: idx < activeIdx ? 100 : 0,
  }));
}

export function useWorkflow() {
  const [state, setState] = useState<WorkflowState>({
    steps: INITIAL_STEPS,
    videoFile: null,
    videoUrl: null,
    videoStorageUrl: null,
    transcript: [],
    transcriptionStatus: '',
    translatedTranscript: [],
    selectedVoiceId: 'aria',
    targetLanguage: 'es-ES',
    voiceRemovalProgress: 0,
    ttsProgress: 0,
    syncProgress: 0,
    exportProgress: 0,
    finalVideoUrl: null,
    finalVideoBlob: null,
    finalVideoSize: 0,
    finalVideoDuration: 0,
    finalVideoExtension: 'webm',
    generatedAudioUrl: null,
    cleanedAudioUrl: null,
    ttsSegments: [],
    syncedAudioUrl: null,
    voiceSpeed: 1.0,
    voiceVolume: 1.0,
    ttsDebugInfo: null,
    error: null,
  });

  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearProgressTimer = useCallback(() => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  }, []);

  const runProgress = useCallback(
    (stepId: WorkflowStep, durationMs: number, onComplete: () => void) => {
      clearProgressTimer();
      setState((prev) => ({
        ...prev,
        steps: prev.steps.map((s) =>
          s.id === stepId ? { ...s, status: 'processing', progress: 0 } : s
        ),
      }));

      const interval = 80;
      const increment = (interval / durationMs) * 100;
      let current = 0;

      progressTimer.current = setInterval(() => {
        current += increment;
        if (current >= 100) {
          current = 100;
          clearProgressTimer();
          setState((prev) => ({
            ...prev,
            steps: prev.steps.map((s) =>
              s.id === stepId ? { ...s, status: 'completed', progress: 100 } : s
            ),
          }));
          onComplete();
        } else {
          setState((prev) => ({
            ...prev,
            steps: prev.steps.map((s) =>
              s.id === stepId ? { ...s, progress: current } : s
            ),
          }));
        }
      }, interval);
    },
    [clearProgressTimer]
  );

  const setStepStatus = useCallback((stepId: WorkflowStep, status: StepStatus, progress?: number) => {
    setState((prev) => ({
      ...prev,
      steps: prev.steps.map((s) =>
        s.id === stepId ? { ...s, status, progress: progress ?? s.progress } : s
      ),
    }));
  }, []);

  const setStepProgress = useCallback((stepId: WorkflowStep, progress: number) => {
    setState((prev) => ({
      ...prev,
      steps: prev.steps.map((s) =>
        s.id === stepId ? { ...s, progress } : s
      ),
    }));
  }, []);

  const setVideoFile = useCallback((file: File, url: string, storageUrl: string) => {
    setState((prev) => ({
      ...prev,
      videoFile: file,
      videoUrl: url,
      videoStorageUrl: storageUrl,
      error: null,
      transcript: [],
      translatedTranscript: [],
      transcriptionStatus: '',
      steps: createStepsWithActive('transcribe'),
      finalVideoUrl: null,
      generatedAudioUrl: null,
    }));
  }, []);

  const setTranscript = useCallback((segments: TranscriptSegment[]) => {
    setState((prev) => ({
      ...prev,
      transcript: segments,
      transcriptionStatus: '',
      steps: createStepsWithActive('translate'),
    }));
  }, []);

  const setTranslatedTranscript = useCallback((segments: TranscriptSegment[]) => {
    setState((prev) => ({
      ...prev,
      translatedTranscript: segments,
      steps: createStepsWithActive('voice-removal'),
    }));
  }, []);

  const setSelectedVoice = useCallback((voiceId: string) => {
    setState((prev) => ({ ...prev, selectedVoiceId: voiceId }));
  }, []);

  const setGeneratedAudio = useCallback((audioUrl: string, durationSec: number) => {
    void durationSec;
    setState((prev) => ({ ...prev, generatedAudioUrl: audioUrl, ttsProgress: 100 }));
  }, []);

  const setCleanedAudio = useCallback((audioUrl: string) => {
    setState((prev) => ({ ...prev, cleanedAudioUrl: audioUrl }));
  }, []);

  const setTTSSegments = useCallback((segs: TTSSegmentResult[]) => {
    setState((prev) => ({ ...prev, ttsSegments: segs }));
  }, []);

  const setSyncedAudio = useCallback((audioUrl: string) => {
    setState((prev) => ({ ...prev, syncedAudioUrl: audioUrl }));
  }, []);

  const setFinalVideoUrl = useCallback((url: string) => {
    setState((prev) => ({ ...prev, finalVideoUrl: url }));
  }, []);

  const setFinalVideoResult = useCallback((url: string, blob: Blob, durationSec: number, sizeBytes: number, fileExtension: string) => {
    setState((prev) => ({
      ...prev,
      finalVideoUrl: url,
      finalVideoBlob: blob,
      finalVideoDuration: durationSec,
      finalVideoSize: sizeBytes,
      finalVideoExtension: fileExtension,
    }));
  }, []);

  const setTTSDebugInfo = useCallback((info: TTSDebugEntry | null) => {
    setState((prev) => ({ ...prev, ttsDebugInfo: info }));
  }, []);

  const setVoiceSpeed = useCallback((speed: number) => {
    setState((prev) => ({ ...prev, voiceSpeed: speed }));
  }, []);

  const setVoiceVolume = useCallback((volume: number) => {
    setState((prev) => ({ ...prev, voiceVolume: volume }));
  }, []);

  const setTargetLanguage = useCallback((lang: string) => {
    const prefix = lang.slice(0, 2).toLowerCase();
    const matchingVoice = VOICE_OPTIONS.find((v) => v.languageCode.slice(0, 2).toLowerCase() === prefix);
    setState((prev) => ({
      ...prev,
      targetLanguage: lang,
      selectedVoiceId: matchingVoice?.id ?? prev.selectedVoiceId,
    }));
  }, []);

  const advanceTo = useCallback((stepId: WorkflowStep) => {
    setState((prev) => ({ ...prev, steps: createStepsWithActive(stepId) }));
  }, []);

  const setTranscriptionStatus = useCallback((status: string) => {
    setState((prev) => ({ ...prev, transcriptionStatus: status }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  const setProgressValue = useCallback((key: keyof WorkflowState, value: number) => {
    setState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    clearProgressTimer();
    setState((prev) => ({
      ...prev,
      steps: INITIAL_STEPS,
      videoFile: null,
      videoUrl: null,
      videoStorageUrl: null,
      transcript: [],
      transcriptionStatus: '',
      translatedTranscript: [],
      voiceRemovalProgress: 0,
      ttsProgress: 0,
      syncProgress: 0,
      exportProgress: 0,
      finalVideoUrl: null,
      finalVideoBlob: null,
      finalVideoSize: 0,
      finalVideoDuration: 0,
      finalVideoExtension: 'webm',
      generatedAudioUrl: null,
      cleanedAudioUrl: null,
      ttsSegments: [],
      syncedAudioUrl: null,
      voiceSpeed: 1.0,
      voiceVolume: 1.0,
      ttsDebugInfo: null,
      error: null,
    }));
  }, [clearProgressTimer]);

  return {
    state,
    runProgress,
    setStepStatus,
    setStepProgress,
    setVideoFile,
    setTranscript,
    setTranscriptionStatus,
    setTranslatedTranscript,
    setSelectedVoice,
    setGeneratedAudio,
    setCleanedAudio,
    setTTSSegments,
    setSyncedAudio,
    setFinalVideoUrl,
    setFinalVideoResult,
    setTTSDebugInfo,
    setVoiceSpeed,
    setVoiceVolume,
    setTargetLanguage,
    advanceTo,
    setError,
    setProgressValue,
    reset,
    clearProgressTimer,
  };
}
