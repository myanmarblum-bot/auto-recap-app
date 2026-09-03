/**
 * Timeline-based audio synchronization.
 *
 * Places each TTS segment at its exact transcript start timestamp.
 * Silence fills the gaps between segments, preserving the original
 * speech timing exactly like SRT subtitles.
 *
 * Uses the Web Audio API (OfflineAudioContext) to render the full
 * timeline as a single audio buffer, then encodes it to a blob.
 */

import type { TTSSegmentResult } from './tts';

export interface SyncOptions {
  segments: TTSSegmentResult[];
  totalDurationSec: number;
  onProgress?: (percent: number) => void;
}

export interface SyncResult {
  audioUrl: string;
  blob: Blob;
  durationSec: number;
  segmentPlacements: { segmentId: string; start: number; end: number; ttsDuration: number }[];
}

/**
 * Renders all TTS segments onto a timeline using OfflineAudioContext.
 * Each segment is placed at its transcript start time.
 * Silence fills the gaps between segments.
 */
export async function syncTTSimeline(opts: SyncOptions): Promise<SyncResult> {
  const { segments, totalDurationSec, onProgress } = opts;

  if (segments.length === 0) {
    throw new Error('No TTS segments to synchronize.');
  }

  onProgress?.(5);

  const sampleRate = 44100;
  const numChannels = 2;
  const lengthInSamples = Math.ceil(totalDurationSec * sampleRate);

  const OfflineAudioContextClass =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;

  const offlineCtx = new OfflineAudioContextClass(numChannels, lengthInSamples, sampleRate);

  const placements: SyncResult['segmentPlacements'] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    onProgress?.(5 + Math.round(((i + 1) / segments.length) * 60));

    // Decode the MP3 buffer into an AudioBuffer
    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await offlineCtx.decodeAudioData(seg.audioBuffer.slice(0));
    } catch {
      console.warn(`Failed to decode segment ${seg.segmentId}, skipping.`);
      continue;
    }

    // Place this segment at its exact transcript start time
    const offsetSec = seg.start;
    const ttsDuration = audioBuffer.duration;

    // Create a buffer source and schedule it at the segment's start time
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(offsetSec);

    placements.push({
      segmentId: seg.segmentId,
      start: offsetSec,
      end: offsetSec + ttsDuration,
      ttsDuration,
    });
  }

  onProgress?.(70);

  // Render the entire timeline
  const renderedBuffer = await offlineCtx.startRendering();

  onProgress?.(85);

  // Encode the rendered buffer to a WAV blob
  const blob = audioBufferToWav(renderedBuffer);
  const audioUrl = URL.createObjectURL(blob);

  onProgress?.(100);

  return {
    audioUrl,
    blob,
    durationSec: renderedBuffer.duration,
    segmentPlacements: placements,
  };
}

/**
 * Encodes an AudioBuffer to a WAV blob (16-bit PCM).
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const numSamples = buffer.length;
  const dataSize = numSamples * numChannels * (bitDepth / 8);
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, format, true); // audio format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true); // byte rate
  view.setUint16(32, numChannels * (bitDepth / 8), true); // block align
  view.setUint16(34, bitDepth, true);

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write interleaved PCM samples
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
