import { Loader2, Check, GitMerge, Clock, Waves, AlertCircle } from 'lucide-react';
import type { StepState } from '../types';
import { cn } from '../lib/utils';

interface SyncPanelProps {
  steps: StepState[];
  onComplete: () => void;
  hasTTS: boolean;
  error: string | null;
}

export function SyncPanel({ steps, onComplete, hasTTS, error }: SyncPanelProps) {
  const step = steps.find((s) => s.id === 'sync');
  const isCompleted = step?.status === 'completed';
  const isProcessing = step?.status === 'processing';
  const isError = step?.status === 'error';
  const progress = step?.progress ?? 0;

  if (!hasTTS && !isCompleted) {
    return (
      <div className="glass-panel p-5 animate-slide-up">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-800">
            <GitMerge className="h-4.5 w-4.5 text-neutral-500" />
          </div>
          <h2 className="text-sm font-semibold text-neutral-300">AI Synchronization</h2>
        </div>
        <p className="text-sm text-neutral-500 mt-2 pl-12">
          Generate AI voice first to enable synchronization.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500/10 border border-primary-500/20">
            <GitMerge className="h-4.5 w-4.5 text-primary-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">AI Synchronization</h2>
            <p className="text-xs text-neutral-400">
              {isCompleted ? 'Voice aligned with timestamps' : 'Place each segment at its exact timestamp'}
            </p>
          </div>
        </div>
        {isCompleted && (
          <span className="flex items-center gap-1.5 rounded-full border border-success-500/30 bg-success-500/10 px-2.5 py-1 text-xs font-medium text-success-300">
            <Check className="h-3 w-3" />
            Synced
          </span>
        )}
      </div>

      <div className="p-5">
        {!isCompleted && !isProcessing && !isError && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
                <Clock className="h-4 w-4 text-primary-400 mb-2" />
                <p className="text-xs font-medium text-neutral-200">Timestamp Alignment</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">Each segment starts at its exact SRT timecode</p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-3">
                <Waves className="h-4 w-4 text-primary-400 mb-2" />
                <p className="text-xs font-medium text-neutral-200">Silence Preservation</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">Gaps between segments remain silent</p>
              </div>
            </div>
            <button onClick={onComplete} className="btn-secondary w-full justify-center">
              <GitMerge className="h-4 w-4" />
              Synchronize Voice with Video
            </button>
          </div>
        )}

        {isProcessing && (
          <div className="py-4">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
              <span className="text-sm text-neutral-300 flex-1">
                {progress < 30
                  ? 'Decoding TTS segments…'
                  : progress < 60
                    ? 'Placing segments on timeline…'
                    : progress < 85
                      ? 'Rendering timeline with silence…'
                      : 'Encoding synced audio…'}
              </span>
              <span className="text-sm font-medium text-primary-400">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
              <div
                className="progress-bar-fill bg-gradient-to-r from-primary-600 to-primary-400"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Timeline visualization */}
            <div className="mt-5 space-y-2">
              <p className="text-[11px] text-neutral-500 mb-2">Building timeline from transcript timestamps</p>
              {Array.from({ length: 5 }).map((_, i) => {
                const segStart = i * 20;
                const segWidth = 15;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-neutral-500 w-14 shrink-0">
                      00:0{i}:00
                    </span>
                    <div className="flex-1 h-6 rounded-md bg-neutral-850 relative overflow-hidden">
                      {/* Silence bar (background) */}
                      <div className="absolute inset-0 bg-neutral-800/50" />
                      {/* TTS segment placed at timestamp */}
                      <div
                        className={cn(
                          'absolute h-full rounded-md transition-all duration-500',
                          'bg-gradient-to-r from-primary-500/40 to-primary-400/40'
                        )}
                        style={{
                          left: `${segStart}%`,
                          width: progress > (i + 1) * 15 ? `${segWidth}%` : '0%',
                        }}
                      >
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] text-primary-200 font-medium">
                          {progress > (i + 1) * 15 ? 'TTS' : ''}
                        </span>
                      </div>
                      {/* Silence indicator */}
                      <div
                        className="absolute h-full"
                        style={{
                          left: `${segStart + segWidth}%`,
                          width: `${20 - segWidth}%`,
                        }}
                      >
                        <span className="absolute inset-0 flex items-center justify-center text-[8px] text-neutral-600">
                          {progress > (i + 1) * 15 ? 'silence' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 p-2.5">
              <Clock className="h-3.5 w-3.5 text-primary-400 shrink-0" />
              <p className="text-[11px] text-neutral-400">
                Each segment is placed at its exact transcript start time. Silence fills the gaps where the original speaker was silent.
              </p>
            </div>
          </div>
        )}

        {isError && (
          <div className="py-4 space-y-3">
            <div className="flex items-start gap-2.5 rounded-xl border border-error-500/30 bg-error-500/10 p-3.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-error-400 mt-0.5" />
              <p className="text-xs text-error-200">{error ?? 'Synchronization failed. Please try again.'}</p>
            </div>
            <button onClick={onComplete} className="btn-secondary w-full justify-center">
              <GitMerge className="h-4 w-4" />
              Try Again
            </button>
          </div>
        )}

        {isCompleted && (
          <div className="flex flex-col items-center py-4">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-success-500/10 border border-success-500/30">
              <GitMerge className="h-6 w-6 text-success-400" />
            </div>
            <p className="text-sm font-medium text-neutral-200 text-center">
              Voice synchronized with timestamps
            </p>
            <p className="mt-1 text-xs text-neutral-400 text-center max-w-xs">
              Each segment is placed at its exact transcript time. Silence preserved between segments. Ready to export.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
