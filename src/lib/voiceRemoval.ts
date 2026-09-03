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

  // Wait for the recorder to flush all remaining data
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
 * Uses canvas + MediaRecorder to capture video frames while playing
 * the mixed audio track. The output container is determined by what
 * MediaRecorder supports — we do NOT force a .mp4 extension on a WebM
 * container, which is what caused the previous corruption.
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

  // Ensure we can actually read frames
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('Video has no visual track — cannot export frames.');
  }

  const durationSec = video.duration;
  if (!durationSec || !isFinite(durationSec) || durationSec <= 0) {
    throw new Error('Video has invalid duration — cannot export.');
  }

  const width = video.videoWidth;
  const height = video.videoHeight;

  onProgress?.(8);

  // ── 2. Set up canvas for video frame capture ──
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available.');

  // Draw a first frame so the canvas stream has valid video from the start
  ctx.fillRect(0, 0, width, height);

  onProgress?.(12);

  // ── 3. Set up audio mixing graph ──
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass();

  // Background audio element (cleaned vocals or original)
  const videoAudioEl = document.createElement('video');
  videoAudioEl.src = cleanedAudioUrl ?? videoUrl;
  videoAudioEl.crossOrigin = 'anonymous';
  videoAudioEl.muted = false;

  await new Promise<void>((resolve, reject) => {
    videoAudioEl.addEventListener('loadedmetadata', () => resolve(), { once: true });
    videoAudioEl.addEventListener('error', () => reject(new Error('Failed to load background audio.')), { once: true });
  });

  const videoAudioSource = audioCtx.createMediaElementSource(videoAudioEl);

  // AI voice audio element
  const aiVoiceEl = document.createElement('audio');
  aiVoiceEl.src = aiVoiceUrl;
  aiVoiceEl.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    aiVoiceEl.addEventListener('loadedmetadata', () => resolve(), { once: true });
    aiVoiceEl.addEventListener('error', () => reject(new Error('Failed to load AI voice audio.')), { once: true });
  });

  const aiVoiceSource = audioCtx.createMediaElementSource(aiVoiceEl);

  const bgGain = audioCtx.createGain();
  bgGain.gain.value = 1.0;
  const voiceGain = audioCtx.createGain();
  voiceGain.gain.value = 1.0;

  videoAudioSource.connect(bgGain);
  aiVoiceSource.connect(voiceGain);

  const mixer = audioCtx.createGain();
  bgGain.connect(mixer);
  voiceGain.connect(mixer);

  const destination = audioCtx.createMediaStreamDestination();
  mixer.connect(destination);

  onProgress?.(18);

  // ── 4. Combine canvas video stream + mixed audio stream ──
  const canvasStream = canvas.captureStream(30);
  const mixedAudioTracks = destination.stream.getAudioTracks();

  if (mixedAudioTracks.length === 0) {
    throw new Error('No audio track produced — cannot export video with sound.');
  }

  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...mixedAudioTracks,
  ]);

  // ── 5. Pick the best supported MIME type ──
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

  onProgress?.(22);

  // ── 6. Start playback and recording ──
  video.currentTime = 0;
  videoAudioEl.currentTime = 0;
  aiVoiceEl.currentTime = 0;

  recorder.start(500); // Larger chunk interval for stability

  // Start all playback simultaneously
  await Promise.all([video.play(), videoAudioEl.play(), aiVoiceEl.play()]);

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

  // Progress tracking
  const progressInterval = setInterval(() => {
    if (durationSec > 0) {
      const pct = 25 + Math.min((video.currentTime / durationSec) * 60, 60);
      onProgress?.(Math.round(pct));
    }
  }, 250);

  // ── 7. Wait for the video to finish playing ──
  await new Promise<void>((resolve) => {
    const onEnded = () => resolve();
    video.addEventListener('ended', onEnded, { once: true });
    // Safety timeout in case 'ended' never fires
    setTimeout(() => resolve(), (durationSec + 5) * 1000);
  });

  cancelAnimationFrame(drawFrameId);
  clearInterval(progressInterval);

  // Draw one final frame to make sure the last frame is captured
  ctx.drawImage(video, 0, 0, width, height);

  onProgress?.(88);

  // ── 8. Flush: request final data, then stop recorder ──
  // Give the recorder a moment to process remaining frames
  await new Promise((r) => setTimeout(r, 500));

  if (recorder.state !== 'inactive') {
    recorder.requestData();
    await new Promise((r) => setTimeout(r, 200));
    recorder.stop();
  }

  const blob = await recordingComplete;

  onProgress?.(94);

  // ── 9. Validate the blob before returning ──
  if (blob.size === 0) {
    throw new Error('Export produced an empty file (0 bytes). Recording may have failed.');
  }

  // A valid video should be at least ~50KB for a few seconds
  const minSize = 50_000;
  if (blob.size < minSize) {
    console.warn('[Export] Blob size suspiciously small:', blob.size, 'bytes');
  }

  // Verify duration by loading the blob back
  const url = URL.createObjectURL(blob);
  const verifiedDuration = await verifyVideoDuration(url);

  // Cleanup
  video.pause();
  videoAudioEl.pause();
  aiVoiceEl.pause();
  video.removeAttribute('src');
  videoAudioEl.removeAttribute('src');
  aiVoiceEl.removeAttribute('src');
  try { audioCtx.close(); } catch { /* already closed */ }

  onProgress?.(100);

  if (verifiedDuration <= 0) {
    // The blob exists but duration couldn't be read — still return it
    // but log a warning. Some WebM blobs need seeking before duration is available.
    console.warn('[Export] Could not verify duration, but blob is non-empty:', blob.size, 'bytes');
  }

  console.log('[Export] Final blob:', {
    size: blob.size,
    type: blob.type,
    duration: verifiedDuration,
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

    // Safety timeout
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

  // Fallback — let the browser choose, assume WebM
  return { mimeType: 'video/webm', fileExtension: 'webm' };
}
