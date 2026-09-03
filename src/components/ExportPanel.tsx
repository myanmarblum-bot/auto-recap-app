import { useState, useRef } from 'react';
import {
  Download,
  FileText,
  AudioLines,
  Film,
  Loader2,
  Check,
  Package,
  RotateCcw,
  Play,
  Pause,
  AlertCircle,
  FileVideo,
  Clock,
  HardDrive,
} from 'lucide-react';
import type { StepState, TranscriptSegment } from '../types';
import { formatTranscript } from '../lib/constants';
import { cn } from '../lib/utils';

interface ExportPanelProps {
  steps: StepState[];
  translatedSegments: TranscriptSegment[];
  videoUrl: string | null;
  generatedAudioUrl: string | null;
  finalVideoUrl: string | null;
  finalVideoSize: number;
  finalVideoDuration: number;
  finalVideoExtension: string;
  exportError: string | null;
  onComplete: () => void;
  onReset: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function ExportPanel({
  steps,
  translatedSegments,
  videoUrl,
  generatedAudioUrl,
  finalVideoUrl,
  finalVideoSize,
  finalVideoDuration,
  finalVideoExtension,
  exportError,
  onComplete,
  onReset,
}: ExportPanelProps) {
  const exportStep = steps.find((s) => s.id === 'export');
  const syncStep = steps.find((s) => s.id === 'sync');
  const isCompleted = exportStep?.status === 'completed';
  const isProcessing = exportStep?.status === 'processing';
  const isError = exportStep?.status === 'error';
  const progress = exportStep?.progress ?? 0;
  const isReady = syncStep?.status === 'completed';
  const [downloadedItems, setDownloadedItems] = useState<Set<string>>(new Set());
  const [isPreviewing, setIsPreviewing] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  // A valid video must have non-zero size and a readable duration
  const isVideoValid = finalVideoUrl !== null && finalVideoSize > 0 && finalVideoDuration > 0;

  const downloadTranscript = () => {
    const text = formatTranscript(
      translatedSegments.map((s) => ({ start: s.start, text: s.translatedText ?? s.text }))
    );
    triggerDownload(text, `translated-transcript-${Date.now()}.txt`, 'text/plain');
    setDownloadedItems((prev) => new Set(prev).add('transcript'));
  };

  const downloadAudio = () => {
    if (!generatedAudioUrl) return;
    const a = document.createElement('a');
    a.href = generatedAudioUrl;
    a.download = `ai-voice-audio-${Date.now()}.mp3`;
    a.click();
    setDownloadedItems((prev) => new Set(prev).add('audio'));
  };

  const downloadVideo = () => {
    if (!finalVideoUrl || !isVideoValid) return;
    const a = document.createElement('a');
    a.href = finalVideoUrl;
    a.download = `translated-video-${Date.now()}.${finalVideoExtension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setDownloadedItems((prev) => new Set(prev).add('video'));
  };

  const togglePreview = () => {
    if (!previewVideoRef.current) return;
    if (isPreviewing) {
      previewVideoRef.current.pause();
      setIsPreviewing(false);
    } else {
      previewVideoRef.current.play();
      setIsPreviewing(true);
    }
  };

  if (!isReady && !isCompleted) {
    return (
      <div className="glass-panel p-5 animate-slide-up">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-800">
            <Package className="h-4.5 w-4.5 text-neutral-500" />
          </div>
          <h2 className="text-sm font-semibold text-neutral-300">Export & Download</h2>
        </div>
        <p className="text-sm text-neutral-500 mt-2 pl-12">
          Synchronize the AI voice with the video before exporting.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success-500/10 border border-success-500/20">
            <Package className="h-4.5 w-4.5 text-success-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Export & Download</h2>
            <p className="text-xs text-neutral-400">
              {isCompleted ? 'Your files are ready' : 'Render the final translated video'}
            </p>
          </div>
        </div>
        {isCompleted && (
          <button onClick={onReset} className="btn-ghost">
            <RotateCcw className="h-3.5 w-3.5" />
            Start Over
          </button>
        )}
      </div>

      <div className="p-5">
        {/* Preview final video before export */}
        {!isCompleted && !isProcessing && (
          <div className="space-y-4">
            {/* Video preview */}
            {videoUrl && (
              <div className="rounded-xl overflow-hidden border border-neutral-800 bg-black">
                <video
                  ref={previewVideoRef}
                  src={videoUrl}
                  onEnded={() => setIsPreviewing(false)}
                  className="aspect-video w-full object-contain"
                  preload="metadata"
                />
                <div className="flex items-center justify-between border-t border-neutral-800 px-3 py-2">
                  <span className="text-[11px] text-neutral-400">Preview the source video with AI voice</span>
                  <button
                    onClick={togglePreview}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
                      isPreviewing
                        ? 'bg-neutral-700 text-neutral-200'
                        : 'bg-primary-500/15 text-primary-300 hover:bg-primary-500/25'
                    )}
                  >
                    {isPreviewing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-0.5" />}
                    {isPreviewing ? 'Pause' : 'Preview Final Video'}
                  </button>
                </div>
              </div>
            )}

            <button onClick={onComplete} className="btn-primary w-full justify-center">
              <Film className="h-4 w-4" />
              Render Final Video
            </button>
          </div>
        )}

        {isProcessing && (
          <div className="py-4">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="h-5 w-5 animate-spin text-success-400" />
              <span className="text-sm text-neutral-300 flex-1">
                {progress < 25
                  ? 'Loading video and audio sources…'
                  : progress < 50
                    ? 'Mixing AI voice with background…'
                    : progress < 80
                      ? 'Encoding video stream…'
                      : progress < 95
                        ? 'Validating output file…'
                        : 'Almost done…'}
              </span>
              <span className="text-sm font-medium text-success-400">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
              <div
                className="progress-bar-fill bg-gradient-to-r from-success-600 to-success-400"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-3 text-[11px] text-neutral-500">
              Rendering in real-time — please keep this tab active until complete.
            </p>
          </div>
        )}

        {isError && (
          <div className="py-4 space-y-3">
            <div className="flex items-start gap-2.5 rounded-xl border border-error-500/30 bg-error-500/10 p-3.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-error-400 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-error-200">Export failed</p>
                <p className="text-xs text-error-300/80 mt-1">{exportError ?? 'An unknown error occurred during rendering.'}</p>
              </div>
            </div>
            <button onClick={onComplete} className="btn-primary w-full justify-center">
              <Film className="h-4 w-4" />
              Try Again
            </button>
          </div>
        )}

        {isCompleted && (
          <div className="space-y-3">
            <div className={cn(
              'rounded-xl border p-4 flex items-center gap-3',
              isVideoValid
                ? 'border-success-500/20 bg-success-500/5'
                : 'border-warning-500/20 bg-warning-500/5'
            )}>
              <div className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl',
                isVideoValid ? 'bg-success-500/15' : 'bg-warning-500/15'
              )}>
                {isVideoValid ? (
                  <Check className="h-5 w-5 text-success-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-warning-400" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-neutral-100">
                  {isVideoValid ? 'Video rendered successfully' : 'Video rendered with warnings'}
                </p>
                <p className="text-xs text-neutral-400">
                  {isVideoValid
                    ? 'Original voice removed. AI voice is the only spoken audio.'
                    : 'File may have issues. Try downloading and playing it.'}
                </p>
              </div>
            </div>

            {/* File validation details */}
            {isVideoValid && (
              <div className="flex items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2.5">
                <div className="flex items-center gap-1.5">
                  <FileVideo className="h-3.5 w-3.5 text-neutral-400" />
                  <span className="text-[11px] text-neutral-300 font-medium uppercase">{finalVideoExtension}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-neutral-400" />
                  <span className="text-[11px] text-neutral-300">{formatDuration(finalVideoDuration)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <HardDrive className="h-3.5 w-3.5 text-neutral-400" />
                  <span className="text-[11px] text-neutral-300">{formatFileSize(finalVideoSize)}</span>
                </div>
              </div>
            )}

            {/* Final video preview */}
            {finalVideoUrl && (
              <div className="rounded-xl overflow-hidden border border-neutral-800 bg-black">
                <video
                  src={finalVideoUrl}
                  controls
                  className="aspect-video w-full object-contain"
                  preload="metadata"
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Transcript */}
              <button
                onClick={downloadTranscript}
                className={cn(
                  'group flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all',
                  downloadedItems.has('transcript')
                    ? 'border-success-500/30 bg-success-500/5'
                    : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-900'
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-500/10 text-accent-400">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-100">Translated Transcript</p>
                  <p className="text-[11px] text-neutral-400 mt-0.5">.txt with timecodes</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-primary-400">
                  <Download className="h-3.5 w-3.5" />
                  Download
                </div>
              </button>

              {/* Audio */}
              <button
                onClick={downloadAudio}
                disabled={!generatedAudioUrl}
                className={cn(
                  'group flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all',
                  !generatedAudioUrl
                    ? 'border-neutral-800 bg-neutral-900/30 opacity-50 cursor-not-allowed'
                    : downloadedItems.has('audio')
                      ? 'border-success-500/30 bg-success-500/5'
                      : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-900'
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-500/10 text-primary-400">
                  <AudioLines className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-100">Generated Audio</p>
                  <p className="text-[11px] text-neutral-400 mt-0.5">AI voice track (MP3)</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-primary-400">
                  <Download className="h-3.5 w-3.5" />
                  Download
                </div>
              </button>

              {/* Video */}
              <button
                onClick={downloadVideo}
                disabled={!isVideoValid}
                className={cn(
                  'group flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all',
                  !isVideoValid
                    ? 'border-neutral-800 bg-neutral-900/30 opacity-50 cursor-not-allowed'
                    : downloadedItems.has('video')
                      ? 'border-success-500/30 bg-success-500/5'
                      : 'border-neutral-800 bg-neutral-900/50 hover:border-neutral-700 hover:bg-neutral-900'
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-500/10 text-success-400">
                  <Film className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-100">Final Video</p>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    {isVideoValid
                      ? `.${finalVideoExtension} · ${formatDuration(finalVideoDuration)} · ${formatFileSize(finalVideoSize)}`
                      : 'Rendering…'}
                  </p>
                </div>
                <div className={cn(
                  'flex items-center gap-1.5 text-xs',
                  isVideoValid ? 'text-success-400' : 'text-neutral-600'
                )}>
                  <Download className="h-3.5 w-3.5" />
                  Download
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
