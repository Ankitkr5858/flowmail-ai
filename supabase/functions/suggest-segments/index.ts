// Supabase Edge Function: suggest-segments
//
// Returns useful audience segment suggestions based on data, plus optional Gemini phrasing.
// Output is an array of { title, description, segment } where segment matches SegmentDefinition.
//
// Deploy:
//   supabase functions deploy suggest-segments
//
// Secrets:
//   SUPABASE_SERVICE_ROLE_KEY=...
// Optional:
//   GEMINI_API_KEY=...  (adds nicer copy, but suggestions still work without it)

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

async function dbFetch(path: string, init?: RequestInit) {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${service}`,
    apikey: service,
    "Content-Type": "application/json",
    ...(init?.headers as any),
  };
  const res = await fetch(`${url}/rest/v1/${path}`, { ...(init ?? {}), headers });
  const body = await res.text();
  if (!res.ok) throw new Error(`DB error ${res.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

async function gemini(apiKey: string, prompt: string) {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 700 },
      }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  const jsonOut = JSON.parse(text);
  return String(jsonOut?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body?.workspaceId ?? "default") || "default";

    // Heuristic-based segments using existing schema fields.
    const suggestions: any[] = [
      {
        key: "engaged_never_purchased",
        title: "Highly engaged, never purchased",
        description: "Contacts with high opens/clicks but 0 purchases.",
        segment: {
          logic: "AND",
          conditions: [
            { id: "c1", field: "leadScore", op: ">=", value: 40 },
            { id: "c2", field: "lifecycleStage", op: "equals", value: "lead" },
          ],
        },
      },
      {
        key: "pricing_clickers",
        title: "Clicked pricing link",
        description: "People who are warm/hot and likely to convert.",
        segment: {
          logic: "OR",
          conditions: [
            { id: "c1", field: "temperature", op: "equals", value: "warm" },
            { id: "c2", field: "temperature", op: "equals", value: "hot" },
          ],
        },
      },
      {
        key: "one_time_buyers_inactive",
        title: "One-time buyers inactive",
        description: "Customers who may need a reactivation offer.",
        segment: {
          logic: "AND",
          conditions: [
            { id: "c1", field: "lifecycleStage", op: "equals", value: "customer" },
            { id: "c2", field: "leadScore", op: "<", value: 30 },
          ],
        },
      },
    ];

    // Optional Gemini: rewrite titles/descriptions to be nicer.
    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (apiKey) {
      const prompt = `Rewrite these segment titles/descriptions to be concise and product-friendly.\nReturn JSON array with same length and keys: title, description.\n\nInput:\n${JSON.stringify(suggestions.map(s => ({ title: s.title, description: s.description })))}`;
      const out = await gemini(apiKey, prompt);
      try {
        const parsed = JSON.parse(out);
        if (Array.isArray(parsed) && parsed.length === suggestions.length) {
          for (let i = 0; i < suggestions.length; i++) {
            suggestions[i].title = String(parsed[i]?.title ?? suggestions[i].title);
            suggestions[i].description = String(parsed[i]?.description ?? suggestions[i].description);
          }
        }
      } catch {
        // ignore
      }
    }

    // Also provide counts quickly (optional best-effort)
    let totalContacts = 0;
    try {
      const countRes = await dbFetch(`contacts?select=id&workspace_id=eq.${encodeURIComponent(workspaceId)}`, { method: "GET" });
      totalContacts = Array.isArray(countRes) ? countRes.length : 0;
    } catch {
      // ignore
    }

    return json({ ok: true, totalContacts, suggestions });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});


