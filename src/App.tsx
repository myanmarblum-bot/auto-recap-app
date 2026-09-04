import { useCallback } from 'react';
import { Header } from '@/components/Header';
import { Stepper } from '@/components/Stepper';
import { VideoUploader } from '@/components/VideoUploader';
import { TranscriptPanel } from '@/components/TranscriptPanel';
import { TranslationPanel } from '@/components/TranslationPanel';
import { VoiceRemovalPanel } from '@/components/VoiceRemovalPanel';
import { VoicePanel } from '@/components/VoicePanel';
import { SyncPanel } from '@/components/SyncPanel';
import { ExportPanel } from '@/components/ExportPanel';
import { useWorkflow } from '@/hooks/useWorkflow';
import { transcribeVideo, deleteVideoFromStorage } from '@/lib/transcription';
import { generateTTSSegments } from '@/lib/tts';
import { removeVocals, exportFinalVideo } from '@/lib/voiceRemoval';
import { syncTTSimeline } from '@/lib/sync';
import { VOICE_OPTIONS } from '@/lib/constants';

async function getVideoDurationSec(videoUrl: string | null): Promise<number> {
  if (!videoUrl) return 0;
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.src = videoUrl;
    v.addEventListener('loadedmetadata', () => {
      const dur = v.duration;
      v.removeAttribute('src');
      resolve(dur && isFinite(dur) ? dur : 0);
    }, { once: true });
    v.addEventListener('error', () => resolve(0), { once: true });
    setTimeout(() => resolve(0), 5000);
  });
}

export default function App() {
  const wf = useWorkflow();
  const { state } = wf;

  const currentStep = state.steps.find((s) => s.status === 'active' || s.status === 'processing')?.id ?? 'upload';

  const handleUpload = useCallback(
    (file: File, localUrl: string, storageUrl: string) => {
      wf.setVideoFile(file, localUrl, storageUrl);
    },
    [wf]
  );

  const handleClearVideo = useCallback(() => {
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    if (state.videoStorageUrl) deleteVideoFromStorage(state.videoStorageUrl);
    wf.reset();
  }, [state.videoUrl, state.videoStorageUrl, wf]);

  const handleGenerateTranscript = useCallback(async () => {
    if (!state.videoStorageUrl) return;
    wf.setStepStatus('transcribe', 'processing', 0);
    wf.setError(null);
    wf.setTranscriptionStatus('submitting');

    try {
      const result = await transcribeVideo(
        state.videoStorageUrl,
        {
          onSubmit: () => {
            wf.setTranscriptionStatus('queued');
          },
          onPoll: (status) => {
            wf.setTranscriptionStatus(status);
          },
        }
      );

      if (result.segments.length === 0) {
        throw new Error('No speech detected in this video. Try a video with clear spoken audio.');
      }

      wf.setTranscript(result.segments);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transcription failed. Please try again.';
      wf.setStepStatus('transcribe', 'error', 0);
      wf.setError(msg);
    }
  }, [state.videoStorageUrl, wf]);

  const handleTranslated = useCallback(
    (segments: typeof state.transcript) => {
      wf.setTranslatedTranscript(segments);
    },
    [wf]
  );

  const handleVoiceRemoval = useCallback(async () => {
    if (!state.videoUrl) return;
    wf.setStepStatus('voice-removal', 'processing', 0);
    wf.setError(null);

    try {
      const result = await removeVocals(state.videoUrl, (percent) => {
        wf.setStepProgress('voice-removal', percent);
      });
      wf.setCleanedAudio(result.cleanedAudioUrl);
      wf.setStepStatus('voice-removal', 'completed', 100);
      wf.advanceTo('tts');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Voice removal failed. Please try again.';
      wf.setStepStatus('voice-removal', 'error', 0);
      wf.setError(msg);
    }
  }, [state.videoUrl, wf]);

  const handleGenerateTTS = useCallback(async () => {
    if (state.translatedTranscript.length === 0) {
      wf.setError('No translated transcript to generate voice from.');
      return;
    }

    const voice = VOICE_OPTIONS.find((v) => v.id === state.selectedVoiceId);
    if (!voice) {
      wf.setError('Please select a voice first.');
      return;
    }

    wf.setStepStatus('tts', 'processing', 0);
    wf.setError(null);

    try {
      const result = await generateTTSSegments(
        state.translatedTranscript,
        voice,
        (percent) => wf.setStepProgress('tts', percent),
        { speed: state.voiceSpeed, volume: state.voiceVolume }
      );

      // Also generate a continuous preview audio from the segment URLs
      const previewUrl = result.segments.length > 0 ? result.segments[0].audioUrl : null;
      if (previewUrl) {
        wf.setGeneratedAudio(previewUrl, 0);
      }
      wf.setTTSSegments(result.segments);
      if (result.debugInfo) {
        wf.setTTSDebugInfo(result.debugInfo);
      }

      if (result.failedSegments.length > 0) {
        const msg = `${result.failedSegments.length} of ${state.translatedTranscript.length} segments failed to generate voice. ` +
          `The video will use ${result.segments.length} segments. You can try regenerating to attempt the failed ones.`;
        wf.setError(msg);
      } else {
        wf.setError(null);
      }

      wf.setStepStatus('tts', 'completed', 100);
      wf.advanceTo('sync');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Voice generation failed. Please try again.';
      wf.setStepStatus('tts', 'error', 0);
      wf.setError(msg);
    }
  }, [state.translatedTranscript, state.selectedVoiceId, state.voiceSpeed, state.voiceVolume, wf]);

  const handleSync = useCallback(async () => {
    if (state.ttsSegments.length === 0) {
      wf.setError('No TTS segments to synchronize.');
      return;
    }

    wf.setStepStatus('sync', 'processing', 0);
    wf.setError(null);

    try {
      // Get the actual video duration by loading metadata — this is the
      // authoritative total duration for the synced audio, NOT the last
      // transcript timestamp (which may be shorter than the video).
      const videoDuration = await getVideoDurationSec(state.videoUrl);
      const lastSeg = state.translatedTranscript[state.translatedTranscript.length - 1];
      const totalDuration = Math.max(videoDuration, lastSeg?.end ?? 0);

      console.log('[Sync] Total duration for sync:', totalDuration, '(video:', videoDuration, ', last seg end:', lastSeg?.end ?? 0, ')');

      const result = await syncTTSimeline({
        segments: state.ttsSegments,
        totalDurationSec: totalDuration,
        onProgress: (percent) => wf.setStepProgress('sync', percent),
      });

      wf.setSyncedAudio(result.audioUrl);
      wf.setStepStatus('sync', 'completed', 100);
      wf.advanceTo('export');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Synchronization failed. Please try again.';
      wf.setStepStatus('sync', 'error', 0);
      wf.setError(msg);
    }
  }, [state.ttsSegments, state.translatedTranscript, wf]);

  const handleExport = useCallback(async () => {
    if (!state.videoUrl) return;
    wf.setStepStatus('export', 'processing', 0);
    wf.setError(null);

    try {
      const result = await exportFinalVideo({
        videoUrl: state.videoUrl,
        cleanedAudioUrl: state.cleanedAudioUrl,
        aiVoiceUrl: state.syncedAudioUrl ?? state.generatedAudioUrl!,
        onProgress: (percent) => wf.setStepProgress('export', percent),
      });
      wf.setFinalVideoResult(result.url, result.blob, result.durationSec, result.sizeBytes, result.fileExtension);
      wf.setStepStatus('export', 'completed', 100);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Video export failed. Please try again.';
      wf.setStepStatus('export', 'error', 0);
      wf.setError(msg);
    }
  }, [state.videoUrl, state.cleanedAudioUrl, state.syncedAudioUrl, state.generatedAudioUrl, wf]);

  const handleReset = useCallback(() => {
    if (state.videoUrl) URL.revokeObjectURL(state.videoUrl);
    if (state.videoStorageUrl) deleteVideoFromStorage(state.videoStorageUrl);
    wf.reset();
  }, [state.videoUrl, state.videoStorageUrl, wf]);

  const hasVideo = state.videoFile !== null;
  const hasTranslation = state.translatedTranscript.length > 0;
  const voiceRemoved = state.steps.find((s) => s.id === 'voice-removal')?.status === 'completed';
  const hasTTS = state.steps.find((s) => s.id === 'tts')?.status === 'completed';

  return (
    <div className="min-h-screen bg-neutral-950">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary-600/8 blur-3xl" />
        <div className="absolute top-1/3 -left-40 h-96 w-96 rounded-full bg-accent-600/6 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-primary-500/5 blur-3xl" />
      </div>

      <div className="relative">
        <Header />

        {/* Hero */}
        <section className="mx-auto max-w-7xl px-4 pt-12 pb-8 sm:px-6 lg:px-8 lg:pt-16">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900/60 px-3.5 py-1.5 text-xs font-medium text-neutral-300 mb-6 animate-fade-in">
              <span className="h-1.5 w-1.5 rounded-full bg-success-400 animate-pulse" />
              AI-Powered · AssemblyAI · Gemini · TTS
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-50 sm:text-4xl lg:text-5xl animate-slide-up">
              Translate Videos.
              <br />
              <span className="bg-gradient-to-r from-primary-400 via-primary-300 to-accent-400 bg-clip-text text-transparent">
                Replace Voices with AI.
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm text-neutral-400 sm:text-base animate-slide-up">
              Upload a video, generate a timestamped transcript, translate it into any language,
              and replace the original voice with AI — all in one streamlined workflow.
            </p>
          </div>
        </section>

        {/* Stepper */}
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="glass-panel px-4 py-4 sm:px-6">
            <Stepper steps={state.steps} currentStep={currentStep} />
          </div>
        </section>

        {/* Main workflow */}
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Left column */}
            <div className="space-y-5">
              <VideoUploader
                onUpload={handleUpload}
                uploadedFile={state.videoFile}
                videoUrl={state.videoUrl}
                onClear={handleClearVideo}
              />
              <TranscriptPanel
                segments={state.transcript}
                steps={state.steps}
                isGenerating={state.steps.find((s) => s.id === 'transcribe')?.status === 'processing'}
                onGenerate={handleGenerateTranscript}
                hasVideo={hasVideo}
                transcriptionStatus={state.transcriptionStatus}
                error={state.error}
              />
              <VoiceRemovalPanel
                steps={state.steps}
                onComplete={handleVoiceRemoval}
                hasTranslation={hasTranslation}
                cleanedAudioUrl={state.cleanedAudioUrl}
                error={state.error}
              />
            </div>

            {/* Right column */}
            <div className="space-y-5">
              <TranslationPanel
                transcript={state.transcript}
                translatedSegments={state.translatedTranscript}
                steps={state.steps}
                targetLanguage={state.targetLanguage}
                onTargetLanguageChange={wf.setTargetLanguage}
                onTranslated={handleTranslated}
              />
              <VoicePanel
                steps={state.steps}
                selectedVoiceId={state.selectedVoiceId}
                onSelectVoice={wf.setSelectedVoice}
                onGenerate={handleGenerateTTS}
                hasTranslation={hasTranslation}
                voiceRemoved={voiceRemoved ?? false}
                targetLanguage={state.targetLanguage}
                voiceSpeed={state.voiceSpeed}
                voiceVolume={state.voiceVolume}
                onSpeedChange={wf.setVoiceSpeed}
                onVolumeChange={wf.setVoiceVolume}
                debugInfo={state.ttsDebugInfo}
                generatedAudioUrl={state.generatedAudioUrl}
              />
              <SyncPanel
                steps={state.steps}
                onComplete={handleSync}
                hasTTS={hasTTS ?? false}
                error={state.error}
              />
              <ExportPanel
                steps={state.steps}
                translatedSegments={state.translatedTranscript}
                videoUrl={state.videoUrl}
                generatedAudioUrl={state.generatedAudioUrl}
                finalVideoUrl={state.finalVideoUrl}
                finalVideoSize={state.finalVideoSize}
                finalVideoDuration={state.finalVideoDuration}
                finalVideoExtension={state.finalVideoExtension}
                exportError={state.error}
                onComplete={handleExport}
                onReset={handleReset}
              />
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-neutral-800 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl flex flex-col items-center justify-between gap-3 text-xs text-neutral-500 sm:flex-row">
            <p>VoxLip — AI Video Translation & Voice Replacement</p>
            <p>Speech Recognition: AssemblyAI · Translation: Gemini · TTS: AI Voices</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
