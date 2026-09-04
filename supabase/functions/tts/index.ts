import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TTSRequest {
  text: string;
  voice: string;
  speed?: number;
  pitch?: number;
  volume?: number;
}

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WIN_EPOCH = 11644473600; // seconds between 1601-01-01 and 1970-01-01
const CHROMIUM_FULL_VERSION = "143.0.3650.75";
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;

async function generateGECToken(): Promise<string> {
  // Current Unix timestamp in seconds
  let ticks = Math.floor(Date.now() / 1000);
  // Switch to Windows file time epoch (1601-01-01)
  ticks += WIN_EPOCH;
  // Round down to nearest 5 minutes (300 seconds)
  ticks -= ticks % 300;
  // Convert to 100-nanosecond intervals (Windows file time format): 1e9/100 = 1e7
  const ticks100ns = BigInt(ticks) * 10000000n;
  const strToHash = `${ticks100ns}${TRUSTED_CLIENT_TOKEN}`;
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(strToHash));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export function detectLanguage(text: string): string {
  if (/[\u1000-\u109F]/.test(text)) return "my";
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return "ja";
  if (/[\uAC00-\uD7AF]/.test(text)) return "ko";
  if (/[\u4E00-\u9FFF]/.test(text)) return "zh";
  if (/[\u0600-\u06FF]/.test(text)) return "ar";
  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/[\u0400-\u04FF]/.test(text)) return "ru";
  return "en";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed. Use POST." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: TTSRequest = await req.json();
    const { text, voice, speed, pitch, volume } = body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "text is required and must not be empty." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!voice || typeof voice !== "string") {
      return new Response(
        JSON.stringify({ error: "voice is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const detectedLang = detectLanguage(text);

    // Use the voice passed by the client directly — never override it.
    // The client is responsible for selecting the correct voice for the language.
    const effectiveVoice = voice;

    console.log(`[TTS] requestedVoice=${voice} effectiveVoice=${effectiveVoice} lang=${detectedLang}`);

    const rate = speed ?? 1.0;
    const vol = volume ?? 1.0;
    const pitchHz = pitch ?? 1.0;

    const ratePercent = `${rate >= 1 ? "+" : ""}${Math.round((rate - 1) * 100)}%`;
    const volPercent = `${vol >= 1 ? "+" : ""}${Math.round((vol - 1) * 100)}%`;
    const pitchStr = `${pitchHz >= 1 ? "+" : ""}${Math.round((pitchHz - 1) * 50)}Hz`;

    const ssml =
      `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
      `<voice name='${effectiveVoice}'>` +
      `<prosody pitch='${pitchStr}' rate='${ratePercent}' volume='${volPercent}'>` +
      escapeXml(text) +
      `</prosody>` +
      `</voice>` +
      `</speak>`;

    // Generate Sec-MS-GEC token for Edge TTS authentication
    const gecToken = await generateGECToken();
    const wsUrl =
      `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
      `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&ConnectionId=${crypto.randomUUID().replace(/-/g, "")}` +
      `&Sec-MS-GEC=${gecToken}` +
      `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

    const { WebSocket } = await import("npm:ws@8.18.0");

    const ws = new WebSocket(wsUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
        "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        "Pragma": "no-cache",
        "Cache-Control": "no-cache",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-WebSocket-Version": "13",
      },
    });

    const audioChunks: Uint8Array[] = [];
    let resolved = false;
    let wsError: string | null = null;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try { ws.close(); } catch { /* already closing */ }
          reject(new Error("Edge TTS WebSocket timed out after 30 seconds."));
        }
      }, 30000);

      ws.on("open", () => {
        const timestamp = new Date().toISOString();

        const configMessage =
          `X-Timestamp:${timestamp}\r\n` +
          `Content-Type:application/json; charset=utf-8\r\n` +
          `Path:speech.config\r\n\r\n` +
          `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"true","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n`;
        ws.send(configMessage);

        const requestId = crypto.randomUUID().replace(/-/g, "");
        const ssmlMessage =
          `X-RequestId:${requestId}\r\n` +
          `Content-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${timestamp}Z\r\n` +
          `Path:ssml\r\n\r\n` +
          ssml;
        ws.send(ssmlMessage);
      });

      ws.on("message", (data: Buffer, isBinary: boolean) => {
        let headers: string;
        let bodyData: Buffer;

        if (isBinary) {
          // Binary frame: first 2 bytes = header length (big-endian)
          if (data.length < 2) return;
          const headerLen = data.readUInt16BE(0);
          if (headerLen > data.length) return;
          headers = data.toString("utf-8", 2, 2 + headerLen);
          bodyData = data.subarray(2 + headerLen);
        } else {
          // Text frame: headers separated by \r\n\r\n
          const headerEnd = data.indexOf("\r\n\r\n");
          if (headerEnd === -1) return;
          headers = data.toString("utf-8", 0, headerEnd);
          bodyData = data.subarray(headerEnd + 4);
        }

        if (headers.includes("Path:audio")) {
          audioChunks.push(new Uint8Array(bodyData));
        } else if (headers.includes("Path:turn.end")) {
          resolved = true;
          clearTimeout(timeout);
          try { ws.close(); } catch { /* already closing */ }
          resolve();
        }
      });

      ws.on("error", (err: Error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          wsError = err.message;
          reject(new Error(`Edge TTS WebSocket error: ${err.message}`));
        }
      });

      ws.on("close", () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          if (wsError) {
            reject(new Error(`Edge TTS connection closed with error: ${wsError}`));
          } else {
            resolve();
          }
        }
      });
    });

    if (audioChunks.length === 0) {
      return new Response(
        JSON.stringify({
          error: "No audio data received from Edge TTS. The voice may not be available.",
          detectedLanguage: detectedLang,
          voiceUsed: effectiveVoice,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Concatenate all audio chunks into a single MP3
    const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const audioBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of audioChunks) {
      audioBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    console.log(`[TTS] lang=${detectedLang} voice=${effectiveVoice} audioBytes=${audioBuffer.length} chunks=${audioChunks.length}`);

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.length),
        "X-Detected-Language": detectedLang,
        "X-Voice-Used": effectiveVoice,
      },
    });
  } catch (err) {
    console.error("[TTS Error]", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error during TTS generation." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
