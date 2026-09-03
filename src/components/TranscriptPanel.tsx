import { useState } from 'react';
import {
  Copy,
  Check,
  Loader2,
  FileText,
  Sparkles,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import type { TranscriptSegment, StepState } from '../types';
import { formatTimecode } from '../lib/constants';

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  steps: StepState[];
  isGenerating: boolean;
  onGenerate: () => void;
  hasVideo: boolean;
  transcriptionStatus: string;
  error: string | null;
}

export function TranscriptPanel({
  segments,
  steps,
  isGenerating,
  onGenerate,
  hasVideo,
  transcriptionStatus,
  error,
}: TranscriptPanelProps) {
  const [copied, setCopied] = useState(false);
  const transcriptStep = steps.find((s) => s.id === 'transcribe');
  const isCompleted = transcriptStep?.status === 'completed';

  const copyTranscript = () => {
    const text = segments
      .map((s) => `[${formatTimecode(s.start)}]\n${s.text}`)
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-panel overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500/10 border border-primary-500/20">
            <FileText className="h-4.5 w-4.5 text-primary-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Transcript</h2>
            <p className="text-xs text-neutral-400">
              {isCompleted ? `${segments.length} segments` : 'Auto-generated with timecodes'}
            </p>
          </div>
        </div>
        {isCompleted && segments.length > 0 && (
          <button onClick={copyTranscript} className="btn-ghost">
            {copied ? (
              <>
                <Check className="h-4 w-4 text-success-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy
              </>
            )}
          </button>
        )}
      </div>

      <div className="p-5">
        {!isCompleted && !isGenerating && (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-800">
              <Sparkles className="h-7 w-7 text-primary-400" />
            </div>
            <p className="text-sm font-medium text-neutral-200">Ready to transcribe</p>
            <p className="mt-1 max-w-xs text-xs text-neutral-400">
              {hasVideo
                ? 'Generate a timestamped transcript from your video using AI speech recognition.'
                : 'Upload a video first to generate a transcript.'}
            </p>
            <button
              onClick={onGenerate}
              disabled={!hasVideo}
              className="btn-primary mt-5"
            >
              Generate Transcript
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {isGenerating && (
          <div className="py-8">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
              <span className="text-sm text-neutral-300">
                {transcriptionStatus === 'queued'
                  ? 'Queued for processing…'
                  : transcriptionStatus === 'processing'
                    ? 'Transcribing audio with AssemblyAI…'
                    : 'Connecting to AssemblyAI…'}
              </span>
              {transcriptionStatus !== 'completed' && (
                <span className="ml-auto text-xs text-neutral-500 animate-pulse">
                  {transcriptionStatus || 'starting'}
                </span>
              )}
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-800">
              <div
                className="progress-bar-fill bg-gradient-to-r from-primary-600 to-primary-400"
                style={{ width: `${transcriptionStatus === 'processing' ? 60 : transcriptionStatus === 'queued' ? 30 : 15}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              This may take 30 seconds to a few minutes depending on video length.
            </p>
            <div className="mt-4 space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex gap-3 items-start"
                  style={{ animationDelay: `${i * 200}ms` }}
                >
                  <div className="h-4 w-16 shrink-0 rounded bg-neutral-800 animate-pulse" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 rounded bg-neutral-800 animate-pulse" style={{ width: `${70 + i * 10}%` }} />
                    <div className="h-3 rounded bg-neutral-800 animate-pulse" style={{ width: `${50 + i * 15}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isCompleted && segments.length > 0 && (
          <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
            {segments.map((seg) => (
              <div
                key={seg.id}
                className="group flex gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 transition-colors hover:border-neutral-700 hover:bg-neutral-900/70"
              >
                <span className="shrink-0 rounded-md bg-primary-500/10 px-2 py-1 font-mono text-[11px] font-medium text-primary-300">
                  {formatTimecode(seg.start)}
                </span>
                <p className="text-sm leading-relaxed text-neutral-200">{seg.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="border-t border-neutral-800 px-5 py-3">
          <div className="flex items-start gap-2.5 rounded-xl border border-error-500/30 bg-error-500/5 px-4 py-3 animate-slide-in">
            <AlertCircle className="h-4.5 w-4.5 text-error-400 shrink-0 mt-0.5" />
            <p className="text-sm text-error-300">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
