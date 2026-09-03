import { useCallback, useRef, useState } from 'react';
import { UploadCloud, FileVideo, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { ACCEPTED_FORMATS, MAX_FILE_SIZE, formatBytes } from '../lib/constants';
import { uploadVideoToStorage } from '../lib/transcription';
import { cn } from '../lib/utils';

interface VideoUploaderProps {
  onUpload: (file: File, localUrl: string, storageUrl: string) => void;
  uploadedFile: File | null;
  videoUrl: string | null;
  onClear: () => void;
}

const ACCEPTED_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv'];
const ACCEPTED_MIME = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];

export function VideoUploader({ onUpload, uploadedFile, videoUrl, onClear }: VideoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ACCEPTED_EXTENSIONS.includes(ext) && !ACCEPTED_MIME.includes(file.type)) {
      return `Unsupported format. Use ${ACCEPTED_FORMATS.join(', ')}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large (max ${formatBytes(MAX_FILE_SIZE)}). Yours is ${formatBytes(file.size)}.`;
    }
    return null;
  };

  const handleFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);
      setIsUploading(true);
      setProgress(0);

      try {
        const localUrl = URL.createObjectURL(file);
        const storageUrl = await uploadVideoToStorage(file, (percent) => {
          setProgress(percent);
        });
        setProgress(100);
        setIsUploading(false);
        onUpload(file, localUrl, storageUrl);
      } catch (err) {
        setIsUploading(false);
        setProgress(0);
        setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      }
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  if (uploadedFile && videoUrl && !isUploading) {
    return (
      <div className="glass-panel p-6 animate-slide-up">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="relative w-full lg:w-2/5 rounded-xl overflow-hidden bg-black border border-neutral-800">
            <video
              src={videoUrl}
              controls
              className="aspect-video w-full object-contain"
              preload="metadata"
            />
          </div>
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success-500/10 border border-success-500/30">
                <CheckCircle2 className="h-5 w-5 text-success-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-100 truncate">{uploadedFile.name}</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  {formatBytes(uploadedFile.size)} · Uploaded successfully
                </p>
              </div>
              <button
                onClick={onClear}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:text-neutral-100 hover:bg-neutral-800 transition-colors"
                aria-label="Remove video"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <p className="text-xs text-neutral-400 mb-2">Next step</p>
              <p className="text-sm text-neutral-200">
                Your video is ready. The AI will now generate a timestamped transcript automatically.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 animate-slide-up">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'relative cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300',
          'flex flex-col items-center justify-center px-6 py-14 text-center',
          isDragging
            ? 'border-primary-500 bg-primary-500/5 scale-[1.01]'
            : 'border-neutral-700 hover:border-neutral-600 hover:bg-neutral-850'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_FORMATS.join(',')}
          onChange={handleInputChange}
          className="hidden"
        />
        <div
          className={cn(
            'mb-4 flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300',
            isDragging ? 'bg-primary-500/20 scale-110' : 'bg-neutral-800'
          )}
        >
          <UploadCloud
            className={cn(
              'h-8 w-8 transition-colors',
              isDragging ? 'text-primary-400' : 'text-neutral-400'
            )}
          />
        </div>
        <p className="text-base font-medium text-neutral-100">
          {isDragging ? 'Drop your video here' : 'Drag & drop your video'}
        </p>
        <p className="mt-1 text-sm text-neutral-400">
          or <span className="text-primary-400 font-medium">browse files</span>
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {ACCEPTED_FORMATS.map((fmt) => (
            <span
              key={fmt}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] font-mono font-medium uppercase text-neutral-400"
            >
              {fmt}
            </span>
          ))}
          <span className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] font-medium text-neutral-400">
            Max 100MB
          </span>
        </div>

        {isUploading && (
          <div className="mt-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-2">
              <FileVideo className="h-5 w-5 text-primary-400 shrink-0" />
              <span className="text-sm text-neutral-300 truncate flex-1">Uploading…</span>
              <span className="text-sm font-medium text-primary-400">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
              <div
                className="progress-bar-fill bg-gradient-to-r from-primary-600 to-primary-400"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-error-500/30 bg-error-500/5 px-4 py-3 animate-slide-in">
          <AlertCircle className="h-4.5 w-4.5 text-error-400 shrink-0 mt-0.5" />
          <p className="text-sm text-error-300">{error}</p>
        </div>
      )}
    </div>
  );
}
