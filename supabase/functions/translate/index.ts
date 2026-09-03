import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TranslateRequest {
  segments: Array<{ id: string; start: number; end: number; text: string }>;
  targetLanguage: string;
  sourceLanguage?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured on the server." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed. Use POST." }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: TranslateRequest = await req.json();
    const { segments, targetLanguage, sourceLanguage } = body;

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return new Response(
        JSON.stringify({ error: "segments array is required and must not be empty." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!targetLanguage || typeof targetLanguage !== "string") {
      return new Response(
        JSON.stringify({ error: "targetLanguage is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the prompt for Gemini
    const langName = languageCodeToName(targetLanguage);
    const sourceLangName = sourceLanguage ? languageCodeToName(sourceLanguage) : "the original language";

    // Number the segments so Gemini returns them in the same order
    const numberedLines = segments
      .map((s, i) => `${i + 1}. ${s.text}`)
      .join("\n");

    const prompt = `You are a professional translator. Translate the following transcript segments from ${sourceLangName} to ${langName}.

Rules:
- Translate each line individually. Keep the same number of lines.
- Preserve the meaning, tone, and natural speech patterns.
- Do NOT add explanations, notes, or extra text.
- Do NOT merge or split lines. Line N in the output must be the translation of line N in the input.
- If a line is already in ${langName}, keep it as-is.

Translate each of these ${segments.length} lines:

${numberedLines}

Return ONLY the translated lines, one per line, numbered identically (1., 2., 3., etc.). No preamble or postamble.`;

    const geminiBody = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        topP: 0.95,
        maxOutputTokens: 8192,
      },
    };

    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${errText}` }),
        { status: geminiRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiRes.json();

    // Extract text from the response
    const candidates = geminiData?.candidates;
    if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
      return new Response(
        JSON.stringify({ error: "Gemini returned no candidates." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parts = candidates[0]?.content?.parts;
    if (!parts || !Array.isArray(parts) || parts.length === 0) {
      // Check if content was blocked
      const finishReason = candidates[0]?.finishReason;
      if (finishReason === "SAFETY") {
        return new Response(
          JSON.stringify({ error: "Translation blocked by safety filters. Please try different content." }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Gemini returned no text content." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const outputText = parts.map((p: Record<string, unknown>) => p.text as string).join("").trim();

    if (!outputText) {
      return new Response(
        JSON.stringify({ error: "Gemini returned empty text." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the numbered lines from Gemini's response
    const translatedTexts = parseNumberedLines(outputText, segments.length);

    // Map translations back to segments, preserving IDs and timestamps
    const translatedSegments = segments.map((seg, i) => ({
      id: seg.id,
      start: seg.start,
      end: seg.end,
      text: seg.text,
      translatedText: translatedTexts[i] ?? seg.text, // fallback to original if missing
    }));

    return new Response(
      JSON.stringify({
        segments: translatedSegments,
        targetLanguage,
        model: GEMINI_MODEL,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Parses Gemini's numbered output back into an array of translated texts.
 * Handles formats like "1. Hola" or "1. Hola a todos" or just "Hola".
 */
function parseNumberedLines(text: string, expectedCount: number): string[] {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const results: string[] = [];

  for (const line of lines) {
    // Try to strip leading number + period/paren: "1. ", "1) ", "1: "
    const match = line.match(/^\d+\s*[.):]\s*(.+)$/);
    if (match) {
      results.push(match[1].trim());
    } else {
      // If the line doesn't start with a number, it might be a continuation
      // or the model didn't number them. Use the line as-is.
      results.push(line);
    }
  }

  // If we got fewer results than expected, pad with empty strings
  // (the frontend will fall back to original text)
  while (results.length < expectedCount) {
    results.push("");
  }

  // If we got more results than expected (model added extra lines), trim
  return results.slice(0, expectedCount);
}

/**
 * Maps a language code like "es-ES" to a human-readable name for the prompt.
 */
function languageCodeToName(code: string): string {
  const map: Record<string, string> = {
    "en-US": "English (US)",
    "en-GB": "English (UK)",
    "es-ES": "Spanish",
    "fr-FR": "French",
    "de-DE": "German",
    "it-IT": "Italian",
    "pt-BR": "Portuguese (Brazilian)",
    "ja-JP": "Japanese",
    "ko-KR": "Korean",
    "zh-CN": "Chinese (Mandarin, Simplified)",
    "ar-SA": "Arabic",
    "hi-IN": "Hindi",
    "ru-RU": "Russian",
    "tr-TR": "Turkish",
    "my": "Burmese (Myanmar)",
  };
  return map[code] ?? code;
}
