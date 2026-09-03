import { useState } from 'react';
import {
  Languages,
  Copy,
  Check,
  Download,
  Upload,
  ArrowRight,
  Sparkles,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { TranscriptSegment, StepState } from '../types';
import { formatTimecode, parseTranscript, LANGUAGES, formatTranscript } from '../lib/constants';
import { translateSegments } from '../lib/translation';

interface TranslationPanelProps {
  transcript: TranscriptSegment[];
  translatedSegments: TranscriptSegment[];
  steps: StepState[];
  targetLanguage: string;
  onTargetLanguageChange: (lang: string) => void;
  onTranslated: (segments: TranscriptSegment[]) => void;
}

export function TranslationPanel({
  transcript,
  translatedSegments,
  steps,
  targetLanguage,
  onTargetLanguageChange,
  onTranslated,
}: TranslationPanelProps) {
  const [copied, setCopied] = useState(false);
  const [importedText, setImportedText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [translateStage, setTranslateStage] = useState<string>('');

  const translateStep = steps.find((s) => s.id === 'translate');
  const isCompleted = translateStep?.status === 'completed';
  const isReady = transcript.length > 0 && !isCompleted;
  const langName = LANGUAGES.find((l) => l.code === targetLanguage)?.name ?? targetLanguage;

  const copyForTranslation = () => {
    const text = formatTranscript(transcript);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadTranscript = () => {
    const text = formatTranscript(transcript);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAutoTranslate = async () => {
    setIsTranslating(true);
    setTranslateError(null);
    setTranslateStage('Sending transcript to Gemini…');

    try {
      setTranslateStage('Translating segments with AI…');
      const result = await translateSegments(transcript, targetLanguage);
      setTranslateStage('');
      setIsTranslating(false);
      onTranslated(result.segments);
    } catch (err) {
      setIsTranslating(false);
      setTranslateStage('');
      const msg = err instanceof Error ? err.message : 'Translation failed. Please try again.';
      setTranslateError(msg);
    }
  };

  const handleImport = () => {
    const parsed = parseTranscript(importedText);
    if (parsed.length === 0) {
      return;
    }
    const translated = transcript.map((seg, idx) => ({
      ...seg,
      translatedText: parsed[idx]?.text ?? seg.text,
    }));
    onTranslated(translated);
    setShowImport(false);
    setImportedText('');
  };

  return (
    <div className="glass-panel overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-500/10 border border-accent-500/20">
            <Languages className="h-4.5 w-4.5 text-accent-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">Translation</h2>
            <p className="text-xs text-neutral-400">
              {isCompleted ? `Translated to ${langName}` : 'Export to Gemini or auto-translate'}
            </p>
          </div>
        </div>
        {isCompleted && translatedSegments.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-full border border-success-500/30 bg-success-500/10 px-2.5 py-1 text-xs font-medium text-success-300">
            <Check className="h-3 w-3" />
            Done
          </span>
        )}
      </div>

      <div className="p-5">
        {!isCompleted && isReady && (
          <div className="space-y-4">
            {/* Language selector */}
            <div>
              <label className="mb-2 block text-xs font-medium text-neutral-400">Target language</label>
              <select
                value={targetLanguage}
                onChange={(e) => onTargetLanguageChange(e.target.value)}
                className="w-full rounded-xl border border-neutral-700 bg-neutral-850 px-4 py-2.5 text-sm text-neutral-100 outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code} className="bg-neutral-850">
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Gemini workflow */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
              <p className="text-xs font-medium text-neutral-300 mb-3">Gemini Translation Workflow</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={copyForTranslation} className="btn-secondary">
                  {copied ? <Check className="h-4 w-4 text-success-400" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied' : 'Copy Transcript'}
                </button>
                <button onClick={downloadTranscript} className="btn-secondary">
                  <Download className="h-4 w-4" />
                  Export .txt
                </button>
                <button onClick={() => setShowImport((v) => !v)} className="btn-secondary">
                  <Upload className="h-4 w-4" />
                  Import Translated
                </button>
              </div>
              {showImport && (
                <div className="mt-3 space-y-2 animate-slide-in">
                  <textarea
                    value={importedText}
                    onChange={(e) => setImportedText(e.target.value)}
                    placeholder={`Paste translated transcript here in the same format:\n[00:00:05]\nHola a todos.\n[00:00:09]\nBienvenidos a nuestro canal.`}
                    rows={6}
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 font-mono text-xs text-neutral-100 outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 resize-y"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleImport}
                      disabled={!importedText.trim()}
                      className="btn-primary"
                    >
                      <Check className="h-4 w-4" />
                      Apply Translation
                    </button>
                    <button onClick={() => setShowImport(false)} className="btn-ghost">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-neutral-800" />
              <span className="text-[11px] font-medium text-neutral-500">OR</span>
              <div className="h-px flex-1 bg-neutral-800" />
            </div>

            {/* Auto-translate */}
            <button
              onClick={handleAutoTranslate}
              disabled={isTranslating}
              className="btn-accent w-full justify-center"
            >
              {isTranslating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {translateStage || 'Translating…'}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Auto-Translate with Gemini AI
                </>
              )}
            </button>
            {isTranslating && (
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <div className="h-1.5 w-1.5 rounded-full bg-accent-400 animate-pulse" />
                This may take a few seconds depending on transcript length…
              </div>
            )}
            {translateError && (
              <div className="flex items-start gap-2.5 rounded-xl border border-error-500/30 bg-error-500/5 px-4 py-3 animate-slide-in">
                <AlertCircle className="h-4.5 w-4.5 text-error-400 shrink-0 mt-0.5" />
                <p className="text-sm text-error-300">{translateError}</p>
              </div>
            )}
          </div>
        )}

        {isCompleted && translatedSegments.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <span className="font-medium text-neutral-300">Original</span>
              <ArrowRight className="h-3.5 w-3.5" />
              <span className="font-medium text-accent-300">{langName}</span>
            </div>
            <div className="max-h-[300px] space-y-2.5 overflow-y-auto pr-1">
              {translatedSegments.map((seg) => (
                <div
                  key={seg.id}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="rounded-md bg-neutral-800 px-2 py-0.5 font-mono text-[10px] text-neutral-400">
                      {formatTimecode(seg.start)}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 mb-1.5 line-through decoration-neutral-700">
                    {seg.text}
                  </p>
                  <p className="text-sm leading-relaxed text-accent-100">
                    {seg.translatedText}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {!isReady && !isCompleted && (
          <div className="py-8 text-center">
            <p className="text-sm text-neutral-500">
              Generate a transcript first to start translating.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
