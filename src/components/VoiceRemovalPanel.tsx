import { useState, useRef, useEffect } from 'react';
import {
  MicOff,
  Loader2,
  Check,
  Volume2,
  Sparkles,
  Play,
  Pause,
  AlertCircle,
  Ear,
} from 'lucide-react';
import type { StepState } from '../types';
import { cn } from '../lib/utils';

interface VoiceRemovalPanelProps {
  steps: StepState[];
  onComplete: () => void;
  hasTranslation: boolean;
  cleanedAudioUrl: string | null;
  error: string | null;
}

export function VoiceRemovalPanel({ steps, onComplete, hasTranslation, cleanedAudioUrl, error }: VoiceRemovalPanelProps) {
  const step = steps.find((s) => s.id === 'voice-removal');
  const isCompleted = step?.status === 'completed';
  const isProcessing = step?.status === 'processing';
  const isError = step?.status === 'error';
  const progress = step?.progress ?? 0;
  const [stage, setStage] = useState(0);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const stages = [
    'Extracting audio from video…',
    'Separating vocal track from background…',
    'Canceling center-channel vocals…',
    'Preserving background music & effects…',
    'Finalizing cleaned audio…',
  ];

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isProcessing) {
      setStage(0);
      timerRef.current = setInterval(() => {
        setStage((prev) => Math.min(prev + 1, stages.length - 1));
      }, 1400);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [isProcessing]);

  const togglePreview = () => {
    if (!cleanedAudioUrl) return;
    if (isPlayingPreview) {
      previewAudioRef.current?.pause();
      setIsPlayingPreview(false);
    } else {
      if (!previewAudioRef.current) {
        previewAudioRef.current = new Audio(cleanedAudioUrl);
        previewAudioRef.current.onended = () => setIsPlayingPreview(false);
      }
      previewAudioRef.current.currentTime = 0;
      previewAudioRef.current.play();
      setIsPlayingPreview(true);
    }
  };

  if (!hasTranslation && !isCompleted) {
    return (
      <div className="glass-panel p-5 animate-slide-up">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-800">
            <MicOff className="h-4.5 w-4.5 text-neutral-500" />
          </div>
          <h2 className="text-sm font-semibold text-neutral-300">Voice Removal</h2>
        </div>
        <p className="text-sm text-neutral-500 mt-2 pl-12">
          Complete the translation step to enable voice removal.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl border",
            isError ? "bg-error-500/10 border-error-500/20" : "bg-error-500/10 border-error-500/20"
          )}>
            <MicOff className="h-4.5 w-4.5 text-error-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Original Voice Removal</h2>
            <p className="text-xs text-neutral-400">
              {isCompleted ? 'Voice isolated and removed' : 'AI separates speech from background'}
            </p>
          </div>
        </div>
        {isCompleted && (
          <span className="flex items-center gap-1.5 rounded-full border border-success-500/30 bg-success-500/10 px-2.5 py-1 text-xs font-medium text-success-300">
            <Check className="h-3 w-3" />
            Removed
          </span>
        )}
      </div>

      <div className="p-5">
        {!isCompleted && !isProcessing && !isError && (
          <div className="space-y-4">
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/10">
                  <Sparkles className="h-4 w-4 text-primary-400" />
                </div>
                <div className="text-xs text-neutral-400 space-y-1.5">
                  <p className="text-neutral-300 font-medium">How it works</p>
                  <p>The original vocal track is separated from background music and sound effects using center-channel cancellation, then removed while preserving the audio landscape.</p>
                </div>
              </div>
            </div>
            <button onClick={onComplete} className="btn-secondary w-full justify-center">
              <MicOff className="h-4 w-4" />
              Remove Original Voice
            </button>
          </div>
        )}

        {isProcessing && (
          <div className="py-4">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="h-5 w-5 animate-spin text-error-400" />
              <span className="text-sm text-neutral-300 flex-1">{stages[stage]}</span>
              <span className="text-sm font-medium text-error-400">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
              <div
                className="progress-bar-fill bg-gradient-to-r from-error-600 to-error-400"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Audio visualizer */}
            <div className="mt-5 flex items-center justify-center gap-1 h-16">
              {Array.from({ length: 32 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full bg-gradient-to-t from-error-600 to-error-400 transition-all"
                  style={{
                    height: `${20 + Math.abs(Math.sin((Date.now() / 200) + i * 0.3)) * 60}%`,
                    animation: `pulse 0.${5 + (i % 4)}s ease-in-out infinite alternate`,
                  }}
                />
              ))}
            </div>

            <div className="mt-4 space-y-2">
              {stages.map((s, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-full transition-colors',
                      i < stage
                        ? 'bg-success-500/20 text-success-400'
                        : i === stage
                          ? 'bg-error-500/20 text-error-400'
                          : 'bg-neutral-800 text-neutral-600'
                    )}
                  >
                    {i < stage ? (
                      <Check className="h-2.5 w-2.5" />
                    ) : i === stage ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <span className="h-1 w-1 rounded-full bg-current" />
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-xs transition-colors',
                      i < stage ? 'text-neutral-500' : i === stage ? 'text-neutral-200' : 'text-neutral-600'
                    )}
                  >
                    {s}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {isError && (
          <div className="py-4 space-y-3">
            <div className="flex items-start gap-2.5 rounded-xl border border-error-500/30 bg-error-500/10 p-3.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-error-400 mt-0.5" />
              <p className="text-xs text-error-200">{error ?? 'Voice removal failed. Please try again.'}</p>
            </div>
            <button onClick={onComplete} className="btn-secondary w-full justify-center">
              <MicOff className="h-4 w-4" />
              Try Again
            </button>
          </div>
        )}

        {isCompleted && cleanedAudioUrl && (
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center py-2">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-success-500/10 border border-success-500/30">
                <Volume2 className="h-6 w-6 text-success-400" />
              </div>
              <p className="text-sm font-medium text-neutral-200 text-center">
                Original voice removed
              </p>
              <p className="mt-1 text-xs text-neutral-400 text-center max-w-xs">
                Background music and sound effects preserved. Ready for AI voice replacement.
              </p>
            </div>

            {/* Preview cleaned audio */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Ear className="h-4 w-4 text-success-400" />
                  <p className="text-xs font-medium text-neutral-300">Preview cleaned audio</p>
                </div>
              </div>
              <button
                onClick={togglePreview}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-medium transition-all',
                  isPlayingPreview
                    ? 'bg-error-500/15 text-error-300 border border-error-500/30'
                    : 'bg-success-500/10 text-success-300 border border-success-500/20 hover:bg-success-500/20'
                )}
              >
                {isPlayingPreview ? (
                  <><Pause className="h-3.5 w-3.5" /> Stop Preview</>
                ) : (
                  <><Play className="h-3.5 w-3.5 ml-0.5" /> Play Background Audio (no voice)</>
                )}
              </button>
            </div>
          </div>
        )}

        {isCompleted && !cleanedAudioUrl && (
          <div className="flex flex-col items-center py-4">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-success-500/10 border border-success-500/30">
              <Volume2 className="h-6 w-6 text-success-400" />
            </div>
            <p className="text-sm font-medium text-neutral-200 text-center">
              Original voice removed
            </p>
            <p className="mt-1 text-xs text-neutral-400 text-center max-w-xs">
              Background music and sound effects preserved. Ready for AI voice replacement.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
