import { useMemo, useState, useRef } from 'react';
import { Play, Pause, Check, Mic2, Sparkles, Loader2, Globe, Star, Gauge, Volume2, AlertCircle, Info, Headphones } from 'lucide-react';
import type { StepState, VoiceOption, TTSDebugEntry } from '../types';
import { VOICE_OPTIONS } from '../lib/constants';
import { speakPreview, stopSpeaking } from '../lib/tts';
import { cn } from '../lib/utils';

interface VoicePanelProps {
  steps: StepState[];
  selectedVoiceId: string;
  onSelectVoice: (id: string) => void;
  onGenerate: () => void;
  hasTranslation: boolean;
  voiceRemoved: boolean;
  targetLanguage: string;
  voiceSpeed: number;
  voiceVolume: number;
  onSpeedChange: (speed: number) => void;
  onVolumeChange: (volume: number) => void;
  debugInfo: TTSDebugEntry | null;
  generatedAudioUrl: string | null;
}

function langPrefix(code: string): string {
  return code.slice(0, 2).toLowerCase();
}

export function VoicePanel({
  steps,
  selectedVoiceId,
  onSelectVoice,
  onGenerate,
  hasTranslation,
  voiceRemoved,
  targetLanguage,
  voiceSpeed,
  voiceVolume,
  onSpeedChange,
  onVolumeChange,
  debugInfo,
  generatedAudioUrl,
}: VoicePanelProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
  const [showAllVoices, setShowAllVoices] = useState(false);
  const [isPlayingGenerated, setIsPlayingGenerated] = useState(false);
  const generatedAudioRef = useRef<HTMLAudioElement | null>(null);

  const ttsStep = steps.find((s) => s.id === 'tts');
  const isCompleted = ttsStep?.status === 'completed';
  const isProcessing = ttsStep?.status === 'processing';
  const progress = ttsStep?.progress ?? 0;
  const isReady = hasTranslation && voiceRemoved;

  const targetPrefix = langPrefix(targetLanguage);

  const matchingVoices = useMemo(
    () => VOICE_OPTIONS.filter((v) => langPrefix(v.languageCode) === targetPrefix),
    [targetPrefix]
  );

  const hasMatchingVoices = matchingVoices.length > 0;
  const showLanguageFilter = hasMatchingVoices && !showAllVoices;

  const visibleVoices = useMemo(() => {
    let voices: VoiceOption[];
    if (showLanguageFilter) {
      voices = matchingVoices;
    } else {
      voices = VOICE_OPTIONS;
    }
    return voices.filter((v) => genderFilter === 'all' || v.gender === genderFilter);
  }, [matchingVoices, showLanguageFilter, genderFilter]);

  const togglePreview = async (voiceId: string) => {
    if (playingId === voiceId) {
      stopSpeaking();
      setPlayingId(null);
      return;
    }
    const voice = VOICE_OPTIONS.find((v) => v.id === voiceId);
    if (!voice) return;
    setPlayingId(voiceId);
    setPreviewError(null);
    try {
      await speakPreview(voice, undefined, { speed: voiceSpeed, volume: voiceVolume });
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed.');
      setPlayingId(null);
    }
  };

  const selectedVoice = VOICE_OPTIONS.find((v) => v.id === selectedVoiceId);

  const toggleGeneratedPreview = () => {
    if (!generatedAudioUrl) return;
    if (isPlayingGenerated) {
      generatedAudioRef.current?.pause();
      setIsPlayingGenerated(false);
    } else {
      if (!generatedAudioRef.current) {
        generatedAudioRef.current = new Audio(generatedAudioUrl);
        generatedAudioRef.current.onended = () => setIsPlayingGenerated(false);
      }
      generatedAudioRef.current.currentTime = 0;
      generatedAudioRef.current.play();
      setIsPlayingGenerated(true);
    }
  };

  if (!isReady && !isCompleted) {
    return (
      <div className="glass-panel p-5 animate-slide-up">
        <div className="flex items-center gap-3 mb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-800">
            <Mic2 className="h-4.5 w-4.5 text-neutral-500" />
          </div>
          <h2 className="text-sm font-semibold text-neutral-300">AI Voice Generation</h2>
        </div>
        <p className="text-sm text-neutral-500 mt-2 pl-12">
          {!hasTranslation
            ? 'Complete translation first.'
            : 'Remove the original voice before generating a new one.'}
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500/10 border border-primary-500/20">
            <Mic2 className="h-4.5 w-4.5 text-primary-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-100">AI Voice Generation</h2>
            <p className="text-xs text-neutral-400">
              {isCompleted ? `Voice: ${selectedVoice?.name}` : 'Microsoft Edge Neural TTS'}
            </p>
          </div>
        </div>
        {isCompleted && (
          <span className="flex items-center gap-1.5 rounded-full border border-success-500/30 bg-success-500/10 px-2.5 py-1 text-xs font-medium text-success-300">
            <Check className="h-3 w-3" />
            Generated
          </span>
        )}
      </div>

      <div className="p-5">
        {!isCompleted && (
          <>
            {/* Language-matched banner + All Voices toggle */}
            {hasMatchingVoices && (
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-neutral-300">
                  <Star className="h-3.5 w-3.5 text-accent-400" />
                  <span>
                    Showing voices for{' '}
                    <span className="font-medium text-accent-300">
                      {matchingVoices[0].language}
                    </span>
                  </span>
                </div>
                <button
                  onClick={() => setShowAllVoices((v) => !v)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all',
                    showAllVoices
                      ? 'bg-primary-600 text-white'
                      : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-750'
                  )}
                >
                  <Globe className="h-3 w-3" />
                  {showAllVoices ? 'Language Voices' : 'All Voices'}
                </button>
              </div>
            )}

            {!hasMatchingVoices && VOICE_OPTIONS.length > 0 && (
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-xs text-neutral-500">
                  No voices for this language — showing all available.
                </p>
              </div>
            )}

            {/* Gender filter */}
            <div className="mb-4 flex items-center gap-1.5">
              {(['all', 'female', 'male'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setGenderFilter(g)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all',
                    genderFilter === g
                      ? 'bg-primary-600 text-white'
                      : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-750'
                  )}
                >
                  {g === 'all' ? 'All' : g}
                </button>
              ))}
            </div>

            {/* Voice grid */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 max-h-[260px] overflow-y-auto pr-1">
              {visibleVoices.map((voice) => {
                const isSelected = voice.id === selectedVoiceId;
                const isPlaying = playingId === voice.id;
                const isLanguageMatch = langPrefix(voice.languageCode) === targetPrefix;
                return (
                  <div
                    key={voice.id}
                    onClick={() => onSelectVoice(voice.id)}
                    className={cn(
                      'group cursor-pointer rounded-xl border p-3 transition-all duration-200',
                      isSelected
                        ? 'border-primary-500 bg-primary-500/5 ring-1 ring-primary-500/30'
                        : 'border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-900/70'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                            voice.gender === 'female'
                              ? 'bg-pink-500/10 text-pink-400'
                              : 'bg-blue-500/10 text-blue-400'
                          )}
                        >
                          <Mic2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-neutral-100 truncate">{voice.name}</p>
                            {isLanguageMatch && (
                              <Star className="h-3 w-3 shrink-0 text-accent-400 fill-accent-400" />
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-400 truncate">{voice.language}</p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePreview(voice.id);
                        }}
                        disabled={isPlaying}
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                          isPlaying
                            ? 'bg-primary-500 text-white'
                            : 'bg-neutral-800 text-neutral-400 hover:text-neutral-100 hover:bg-neutral-700'
                        )}
                        aria-label={isPlaying ? 'Stop preview' : 'Preview voice'}
                      >
                        {isPlaying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-neutral-500">{voice.description}</p>
                    <p className="mt-1 text-[10px] text-neutral-600 font-mono">{voice.edgeVoice}</p>
                    {isSelected && (
                      <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary-300">
                        <Check className="h-3 w-3" />
                        Selected
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {previewError && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-error-500/30 bg-error-500/10 p-2.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-error-400 mt-0.5" />
                <p className="text-[11px] text-error-200">{previewError}</p>
              </div>
            )}

            {/* Speed & Volume controls */}
            <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Gauge className="h-3.5 w-3.5 text-primary-400" />
                  <label className="text-xs font-medium text-neutral-300">Speed</label>
                  <span className="ml-auto text-xs font-mono text-primary-300">{voiceSpeed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={voiceSpeed}
                  onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
                  className="w-full accent-primary-500"
                />
                <div className="flex justify-between mt-1 text-[10px] text-neutral-600">
                  <span>0.5x</span>
                  <span>1x</span>
                  <span>2x</span>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Volume2 className="h-3.5 w-3.5 text-primary-400" />
                  <label className="text-xs font-medium text-neutral-300">Volume</label>
                  <span className="ml-auto text-xs font-mono text-primary-300">{Math.round(voiceVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={voiceVolume}
                  onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                  className="w-full accent-primary-500"
                />
                <div className="flex justify-between mt-1 text-[10px] text-neutral-600">
                  <span>Mute</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={onGenerate}
              disabled={isProcessing}
              className="btn-primary mt-5 w-full justify-center"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating AI Voice… {Math.round(progress)}%
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate AI Voice with {selectedVoice?.name}
                </>
              )}
            </button>
            {isProcessing && (
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="progress-bar-fill bg-gradient-to-r from-primary-600 to-primary-400"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </>
        )}

        {isCompleted && (
          <div className="flex flex-col items-center py-4">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-success-500/10 border border-success-500/30">
              <Mic2 className="h-6 w-6 text-success-400" />
            </div>
            <p className="text-sm font-medium text-neutral-200 text-center">
              AI voice generated
            </p>
            <p className="mt-1 text-xs text-neutral-400 text-center">
              Using <span className="text-primary-300 font-medium">{selectedVoice?.name}</span> ({selectedVoice?.language})
            </p>
            <div className="mt-3 flex items-center gap-4 text-[11px] text-neutral-500">
              <span>Speed: {voiceSpeed.toFixed(1)}x</span>
              <span>Volume: {Math.round(voiceVolume * 100)}%</span>
            </div>

            {/* Preview generated audio */}
            {generatedAudioUrl && (
              <button
                onClick={toggleGeneratedPreview}
                className={cn(
                  'mt-4 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-medium transition-all',
                  isPlayingGenerated
                    ? 'border-primary-500/40 bg-primary-500/15 text-primary-200'
                    : 'border-primary-500/20 bg-primary-500/10 text-primary-300 hover:bg-primary-500/20'
                )}
              >
                {isPlayingGenerated ? (
                  <><Pause className="h-3.5 w-3.5" /> Stop AI Voice</>
                ) : (
                  <><Headphones className="h-3.5 w-3.5" /> Preview AI Voice Audio</>
                )}
              </button>
            )}

            {debugInfo && (
              <div className="mt-4 w-full rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Info className="h-3.5 w-3.5 text-primary-400" />
                  <p className="text-xs font-medium text-neutral-300">Debug Log</p>
                </div>
                <div className="space-y-1 text-[11px] font-mono text-neutral-400">
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Detected Language:</span>
                    <span className="text-accent-300">{debugInfo.detectedLanguage}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Selected Voice:</span>
                    <span className="text-primary-300">{debugInfo.selectedVoice}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Audio Duration:</span>
                    <span className="text-success-300">{debugInfo.audioDurationSec.toFixed(1)}s</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-neutral-500 shrink-0">Text Preview:</span>
                    <span className="text-neutral-300 truncate" dir="auto">{debugInfo.textPreview}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
