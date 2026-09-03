import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ASSEMBLYAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "AssemblyAI API key not configured on the server." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/transcribe/, "");
    const method = req.method;

    // Route: POST /transcribe  → submit transcript job
    // Body: { audio_url: string, language_code?: string }
    if (method === "POST" && (path === "" || path === "/")) {
      const body = await req.json();
      const { audio_url, language_code } = body;

      if (!audio_url || typeof audio_url !== "string") {
        return new Response(
          JSON.stringify({ error: "audio_url is required." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const submitBody: Record<string, unknown> = {
        audio_url,
        format_text: true,
        punctuate: true,
      };
      if (language_code && typeof language_code === "string") {
        submitBody.language_code = language_code;
      }

      const submitRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
        method: "POST",
        headers: {
          authorization: apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify(submitBody),
      });

      if (!submitRes.ok) {
        const errText = await submitRes.text();
        return new Response(
          JSON.stringify({ error: `AssemblyAI submit failed: ${errText}` }),
          { status: submitRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const submitData = await submitRes.json();
      return new Response(
        JSON.stringify({ id: submitData.id, status: submitData.status }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Route: GET /transcribe/:id  → poll transcript status & return result
    if (method === "GET" && path.startsWith("/")) {
      const transcriptId = path.slice(1);
      if (!transcriptId) {
        return new Response(
          JSON.stringify({ error: "Transcript ID is required." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pollRes = await fetch(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
        headers: { authorization: apiKey },
      });

      if (!pollRes.ok) {
        const errText = await pollRes.text();
        return new Response(
          JSON.stringify({ error: `AssemblyAI poll failed: ${errText}` }),
          { status: pollRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await pollRes.json();

      // Return simplified result to the frontend
      const result: Record<string, unknown> = {
        id: data.id,
        status: data.status,
      };

      if (data.status === "completed") {
        result.text = data.text;
        result.language_code = data.language_code;
        result.audio_duration = data.audio_duration;

        // Map words into timestamped segments using AssemblyAI's utterances
        if (data.utterances && Array.isArray(data.utterances)) {
          result.segments = data.utterances.map((u: Record<string, unknown>) => ({
            start: Math.round((u.start as number) / 1000), // ms → seconds
            end: Math.round((u.end as number) / 1000),
            text: u.text as string,
            speaker: u.speaker as string | null,
            confidence: u.confidence as number | null,
          }));
        } else if (data.words && Array.isArray(data.words) && data.words.length > 0) {
          // Fallback: build segments from words grouped by sentence boundaries
          const words = data.words as Array<Record<string, number | string>>;
          const segments: Array<{ start: number; end: number; text: string }> = [];
          let currentWords: string[] = [];
          let currentStart = 0;

          for (const w of words) {
            const wordText = w.text as string;
            const wordStart = Math.round((w.start as number) / 1000);

            if (currentWords.length === 0) {
              currentStart = wordStart;
            }
            currentWords.push(wordText);

            // Sentence boundary: end on ., ?, or !
            if (/[.!?]$/.test(wordText)) {
              segments.push({
                start: currentStart,
                end: Math.round((w.end as number) / 1000),
                text: currentWords.join(" "),
              });
              currentWords = [];
            }
          }
          if (currentWords.length > 0) {
            segments.push({
              start: currentStart,
              end: Math.round((words[words.length - 1].end as number) / 1000),
              text: currentWords.join(" "),
            });
          }
          result.segments = segments;
        } else if (data.text) {
          // Last resort: single segment with full text
          result.segments = [{ start: 0, end: Math.round(data.audio_duration || 0), text: data.text }];
        }
      } else if (data.status === "error") {
        result.error = data.error || "Transcription failed.";
      }

      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Not found." }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
