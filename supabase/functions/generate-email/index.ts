// Supabase Edge Function: generate-email
// Deploy:
//   supabase functions deploy generate-email
// Set secret:
//   supabase secrets set GEMINI_API_KEY=...
//
// Invoked from the frontend via:
//   supabase.functions.invoke('generate-email', { body: { topic, tone } })

// Avoid TS errors in the Vite workspace: these globals exist in the Supabase Edge runtime.
declare const Deno: any;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function geminiGenerateJSON(apiKey: string, prompt: string) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" +
    `?key=${encodeURIComponent(apiKey)}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      // Gemini API supports structured responses; JSON is best-effort but works well with this setting.
      responseMimeType: "application/json",
      temperature: 0.7,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${raw}`);
  }

  const parsed = JSON.parse(raw);
  const text =
    parsed?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join("") ??
    "";
  if (!text) throw new Error("Gemini returned empty text");

  return JSON.parse(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!apiKey) return json({ error: "Missing GEMINI_API_KEY secret" }, 500);

    const { topic, tone, audienceType, wantVariants } = await req.json().catch(() => ({}));
    if (!topic || typeof topic !== "string") return json({ error: "Missing topic" }, 400);
    const safeTone = typeof tone === "string" && tone.trim().length > 0 ? tone.trim() : "Professional";
    const audience = typeof audienceType === "string" && audienceType.trim().length > 0 ? audienceType.trim() : "general";
    const variants = Boolean(wantVariants);

    const prompt = `
You are an expert email marketing copywriter.
Write a compelling email subject line and body for an email automation campaign.

Topic: ${topic}
Tone: ${safeTone}
Audience type: ${audience}

Return strictly valid JSON with keys "subject" and "body".
Also include keys:
- "previewText" (string)
- "subjectOptions" (array of 5 short subject lines)
- "previewOptions" (array of 5 short preview texts)
Do not add markdown formatting like \`\`\`json.
The output must be plain text (no markdown symbols).
`.trim();

    const out = await geminiGenerateJSON(apiKey, prompt);
    const subject = String(out?.subject ?? "").trim();
    const body = String(out?.body ?? "").trim();
    const previewText = String(out?.previewText ?? out?.preview_text ?? "").trim();
    const subjectOptions = Array.isArray(out?.subjectOptions) ? out.subjectOptions.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 5) : [];
    const previewOptions = Array.isArray(out?.previewOptions) ? out.previewOptions.map((x: any) => String(x).trim()).filter(Boolean).slice(0, 5) : [];

    if (!subject || !body) return json({ error: "Model did not return subject/body" }, 502);
    if (variants) {
      return json({ subject, body, previewText, subjectOptions, previewOptions, audienceType: audience });
    }
    return json({ subject, body, previewText });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});


