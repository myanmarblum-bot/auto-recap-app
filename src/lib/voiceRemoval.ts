/**
 * Client-side vocal removal using the Web Audio API.
 *
 * The classic "center-channel removal" technique: vocals are typically panned
 * to the center (equal in L and R). By computing L - R, we cancel out anything
 * that is identical in both channels (i.e., the lead vocal), while preserving
 * stereo-differenced content (background music, sound effects, ambience).
 */

export interface VoiceRemovalResult {
  cleanedAudioUrl: string;
  cleanedAudioBlob: Blob;
  durationSec: number;
}

export async function removeVocals(
  videoUrl: string,
  onProgress?: (percent: number) => void
): Promise<VoiceRemovalResult> {
  onProgress?.(5);

  const video = document.createElement('video');
  video.src = videoUrl;
  video.crossOrigin = 'anonymous';
  video.muted = true;

  await new Promise<void>((resolve, reject) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('Failed to load video for audio extraction.')), { once: true });
  });

  const durationSec = video.duration;
  onProgress?.(15);

  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass();
  const source = audioCtx.createMediaElementSource(video);

  const splitter = audioCtx.createChannelSplitter(2);
  const merger = audioCtx.createChannelMerger(2);
  const invertGain = audioCtx.createGain();
  invertGain.gain.value = -1;

  source.connect(splitter);
  splitter.connect(merger, 0, 0);
  splitter.connect(merger, 0, 1);
  splitter.connect(invertGain, 1);
  invertGain.connect(merger, 0, 0);
  invertGain.connect(merger, 0, 1);

  const highpass = audioCtx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 80;

  const lowpass = audioCtx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 15000;

  merger.connect(highpass);
  highpass.connect(lowpass);

  const destination = audioCtx.createMediaStreamDestination();
  lowpass.connect(destination);

  const mimeType = getSupportedAudioMimeType();
  const recorder = new MediaRecorder(destination.stream, mimeType ? { mimeType } : undefined);

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const recordingComplete = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
      resolve(blob);
    };
  });

  video.currentTime = 0;
  recorder.start(100);

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  await video.play();

  const progressInterval = setInterval(() => {
    if (durationSec > 0) {
      const pct = 20 + Math.min((video.currentTime / durationSec) * 70, 70);
      onProgress?.(Math.round(pct));
    }
  }, 200);

  await new Promise<void>((resolve) => {
    video.addEventListener('ended', () => resolve(), { once: true });
  });

  clearInterval(progressInterval);
  onProgress?.(92);

  if (recorder.state !== 'inactive') {
    recorder.stop();
  }
  const blob = await recordingComplete;

  video.pause();
  video.removeAttribute('src');
  try { source.disconnect(); } catch { /* already disconnected */ }
  try { audioCtx.close(); } catch { /* already closed */ }

  onProgress?.(100);

  const cleanedAudioUrl = URL.createObjectURL(blob);

  return { cleanedAudioUrl, cleanedAudioBlob: blob, durationSec };
}

function getSupportedAudioMimeType(): string | null {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

// ─── Final video export ────────────────────────────────────────────

export interface ExportOptions {
  videoUrl: string;
  cleanedAudioUrl: string | null;
  aiVoiceUrl: string;
  onProgress?: (percent: number) => void;
}

export interface ExportResult {
  url: string;
  blob: Blob;
  durationSec: number;
  sizeBytes: number;
  mimeType: string;
  fileExtension: string;
}

/**
 * Mixes the cleaned background audio with the generated AI voice audio,
 * then combines with the video to produce a final video file.
 *
 * The audio mix is pre-rendered using OfflineAudioContext (fast, not
 * real-time) and then played back as a single audio element during
 * video frame capture. This ensures:
 * 1. The audio is complete and correct before video capture starts
 * 2. The video plays to its full duration (the 'ended' event is the
 *    only stop signal — no premature timeouts)
 * 3. Audio and video stay in sync because there's only one audio source
 */
export async function exportFinalVideo(opts: ExportOptions): Promise<ExportResult> {
  const { videoUrl, cleanedAudioUrl, aiVoiceUrl, onProgress } = opts;

  onProgress?.(2);

  // ── 1. Load the source video ──
  const video = document.createElement('video');
  video.src = videoUrl;
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('Failed to load video for export.')), { once: true });
  });

  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('Video has no visual track — cannot export frames.');
  }

  const durationSec = video.duration;
  if (!durationSec || !isFinite(durationSec) || durationSec <= 0) {
    throw new Error('Video has invalid duration — cannot export.');
  }

  const width = video.videoWidth;
  const height = video.videoHeight;

  console.log('[Export] Video dimensions:', width, 'x', height, 'duration:', durationSec);

  onProgress?.(8);

  // ── 2. Pre-render the mixed audio offline ──
  // This decodes both audio sources, mixes them, and encodes to WAV
  // all offline (faster than real-time, no playback desync risk)
  const mixedAudioUrl = await mixAudioOffline({
    cleanedAudioUrl,
    aiVoiceUrl,
    targetDurationSec: durationSec,
  });

  onProgress?.(25);

  // ── 3. Set up canvas for video frame capture ──
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available.');
  ctx.fillRect(0, 0, width, height);

  // ── 4. Set up the mixed audio as a single element ──
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass();

  const mixedAudioEl = document.createElement('audio');
  mixedAudioEl.src = mixedAudioUrl;
  mixedAudioEl.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    mixedAudioEl.addEventListener('loadedmetadata', () => resolve(), { once: true });
    mixedAudioEl.addEventListener('error', () => reject(new Error('Failed to load mixed audio for playback.')), { once: true });
  });

  const mixedAudioSource = audioCtx.createMediaElementSource(mixedAudioEl);
  const destination = audioCtx.createMediaStreamDestination();
  mixedAudioSource.connect(destination);

  onProgress?.(30);

  // ── 5. Combine canvas video stream + mixed audio stream ──
  const canvasStream = canvas.captureStream(30);
  const mixedAudioTracks = destination.stream.getAudioTracks();

  if (mixedAudioTracks.length === 0) {
    throw new Error('No audio track produced — cannot export video with sound.');
  }

  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...mixedAudioTracks,
  ]);

  // ── 6. Pick the best supported MIME type ──
  const { mimeType, fileExtension } = getBestVideoMimeType();
  console.log('[Export] Using MIME type:', mimeType, 'extension:', fileExtension);

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 5_000_000,
    audioBitsPerSecond: 128_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const recordingComplete = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      try {
        const blob = new Blob(chunks, { type: mimeType });
        resolve(blob);
      } catch {
        reject(new Error('Failed to assemble video blob.'));
      }
    };
    recorder.onerror = () => {
      reject(new Error('MediaRecorder encountered an error during encoding.'));
    };
  });

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  onProgress?.(35);

  // ── 7. Start recording and playback ──
  video.currentTime = 0;
  mixedAudioEl.currentTime = 0;

  recorder.start(500);

  // Start video playback (muted — audio comes from the mixed track)
  await video.play();
  // Start mixed audio playback simultaneously
  mixedAudioEl.play().catch((err) => console.warn('[Export] Mixed audio play error:', err));

  // Draw video frames to canvas at ~30fps
  let drawFrameId: number = 0;
  let lastDrawTime = 0;
  const frameInterval = 1000 / 30;
  const drawFrame = (timestamp: number) => {
    if (timestamp - lastDrawTime >= frameInterval) {
      ctx.drawImage(video, 0, 0, width, height);
      lastDrawTime = timestamp;
    }
    drawFrameId = requestAnimationFrame(drawFrame);
  };
  drawFrameId = requestAnimationFrame(drawFrame);

  // Progress tracking — based on video.currentTime, the source of truth
  const progressInterval = setInterval(() => {
    if (durationSec > 0 && video.currentTime > 0) {
      const pct = 35 + Math.min((video.currentTime / durationSec) * 55, 55);
      onProgress?.(Math.round(pct));
    }
  }, 250);

  // ── 8. Wait for the video to finish playing ──
  // The video 'ended' event is the ONLY stop signal.
  // The safety timeout is 3x the duration to handle any playback stalling,
  // but it will NOT fire before 'ended' under normal conditions.
  await new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
    video.addEventListener('ended', finish, { once: true });
    // Safety: 3x duration + 10s buffer. This is long enough that 'ended'
    // will always fire first under normal playback.
    setTimeout(finish, (durationSec * 3 + 10) * 1000);
  });

  cancelAnimationFrame(drawFrameId);
  clearInterval(progressInterval);

  // Draw the final frame
  ctx.drawImage(video, 0, 0, width, height);

  onProgress?.(92);

  // ── 9. Flush: request final data, then stop recorder ──
  await new Promise((r) => setTimeout(r, 500));

  if (recorder.state !== 'inactive') {
    recorder.requestData();
    await new Promise((r) => setTimeout(r, 200));
    recorder.stop();
  }

  const blob = await recordingComplete;

  onProgress?.(95);

  // ── 10. Validate the blob ──
  if (blob.size === 0) {
    throw new Error('Export produced an empty file (0 bytes). Recording may have failed.');
  }

  const minSize = 50_000;
  if (blob.size < minSize) {
    console.warn('[Export] Blob size suspiciously small:', blob.size, 'bytes');
  }

  // Verify duration
  const url = URL.createObjectURL(blob);
  const verifiedDuration = await verifyVideoDuration(url);

  // Cleanup
  video.pause();
  mixedAudioEl.pause();
  video.removeAttribute('src');
  mixedAudioEl.removeAttribute('src');
  URL.revokeObjectURL(mixedAudioUrl);
  try { audioCtx.close(); } catch { /* already closed */ }

  onProgress?.(100);

  console.log('[Export] Final result:', {
    size: blob.size,
    type: blob.type,
    expectedDuration: durationSec,
    verifiedDuration,
  });

  return {
    url,
    blob,
    durationSec: verifiedDuration || durationSec,
    sizeBytes: blob.size,
    mimeType,
    fileExtension,
  };
}

/**
 * Pre-renders the mixed audio (background + AI voice) offline using
 * OfflineAudioContext. This is faster than real-time and eliminates
 * the desync risk of playing multiple audio elements simultaneously.
 *
 * The output is a WAV blob at the target duration.
 */
async function mixAudioOffline(opts: {
  cleanedAudioUrl: string | null;
  aiVoiceUrl: string;
  targetDurationSec: number;
}): Promise<string> {
  const { cleanedAudioUrl, aiVoiceUrl, targetDurationSec } = opts;

  const sampleRate = 44100;
  const numChannels = 2;
  const lengthInSamples = Math.ceil(targetDurationSec * sampleRate);

  const OfflineAudioContextClass =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;

  const offlineCtx = new OfflineAudioContextClass(numChannels, lengthInSamples, sampleRate);

  // Decode and place background audio (cleaned vocals or original video audio)
  if (cleanedAudioUrl) {
    try {
      const bgBuffer = await fetchAndDecodeAudio(offlineCtx, cleanedAudioUrl);
      const bgSource = offlineCtx.createBufferSource();
      bgSource.buffer = bgBuffer;
      const bgGain = offlineCtx.createGain();
      bgGain.gain.value = 1.0;
      bgSource.connect(bgGain);
      bgGain.connect(offlineCtx.destination);
      bgSource.start(0);
      console.log('[Export-Mix] Background audio placed, duration:', bgBuffer.duration);
    } catch (err) {
      console.warn('[Export-Mix] Failed to decode background audio, skipping:', err);
    }
  }

  // Decode and place AI voice audio
  try {
    const voiceBuffer = await fetchAndDecodeAudio(offlineCtx, aiVoiceUrl);
    const voiceSource = offlineCtx.createBufferSource();
    voiceSource.buffer = voiceBuffer;
    const voiceGain = offlineCtx.createGain();
    voiceGain.gain.value = 1.0;
    voiceSource.connect(voiceGain);
    voiceGain.connect(offlineCtx.destination);
    voiceSource.start(0);
    console.log('[Export-Mix] AI voice audio placed, duration:', voiceBuffer.duration);
  } catch (err) {
    console.warn('[Export-Mix] Failed to decode AI voice audio:', err);
  }

  // Render the mix offline
  const renderedBuffer = await offlineCtx.startRendering();
  console.log('[Export-Mix] Rendered mix duration:', renderedBuffer.duration);

  // Encode to WAV
  const wavBlob = audioBufferToWav(renderedBuffer);
  return URL.createObjectURL(wavBlob);
}

/**
 * Fetches an audio URL and decodes it into an AudioBuffer using the
 * provided AudioContext.
 */
async function fetchAndDecodeAudio(
  ctx: BaseAudioContext,
  url: string
): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    throw new Error('Fetched audio is empty (0 bytes)');
  }
  return await ctx.decodeAudioData(arrayBuffer);
}

/**
 * Encodes an AudioBuffer to a WAV blob (16-bit PCM).
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;

  const numSamples = buffer.length;
  const dataSize = numSamples * numChannels * (bitDepth / 8);
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');

  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);

  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Loads a video blob URL and checks its duration.
 * Returns 0 if duration cannot be determined.
 */
function verifyVideoDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const testVideo = document.createElement('video');
    testVideo.preload = 'metadata';
    testVideo.src = url;

    const cleanup = () => {
      testVideo.removeAttribute('src');
      testVideo.load();
    };

    testVideo.addEventListener('loadedmetadata', () => {
      const dur = testVideo.duration;
      cleanup();
      resolve(dur && isFinite(dur) ? dur : 0);
    }, { once: true });

    testVideo.addEventListener('error', () => {
      cleanup();
      resolve(0);
    }, { once: true });

    setTimeout(() => {
      cleanup();
      resolve(0);
    }, 5000);
  });
}

/**
 * Returns the best supported video MIME type for MediaRecorder.
 * Crucially, also returns the correct file extension for that container
 * so the download doesn't produce a mismatched file.
 */
function getBestVideoMimeType(): { mimeType: string; fileExtension: string } {
  const candidates: { mimeType: string; fileExtension: string }[] = [
    { mimeType: 'video/mp4;codecs=h264,aac', fileExtension: 'mp4' },
    { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', fileExtension: 'mp4' },
    { mimeType: 'video/mp4', fileExtension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9,opus', fileExtension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', fileExtension: 'webm' },
    { mimeType: 'video/webm;codecs=vp9', fileExtension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8', fileExtension: 'webm' },
    { mimeType: 'video/webm', fileExtension: 'webm' },
  ];

  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }

  return { mimeType: 'video/webm', fileExtension: 'webm' };
}
