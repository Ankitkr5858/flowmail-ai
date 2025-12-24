// Supabase Edge Function: lead-score-worker
//
// Rule-based lead scoring engine:
// - processes new contact_events incrementally
// - updates contacts.lead_score and maps contacts.temperature
//
// Rules (simple defaults; tweak as needed):
// - email_open: +1
// - link_click: +3 (pricing/checkout links: +5)
// - form_submitted: +4 (webinar forms: +10)
// - purchase: +15
// - inactivity: handled by separate job (optional)
//
// Temperature mapping:
// - 0..19 => cold
// - 20..49 => warm
// - 50+ => hot
//
// Deploy:
//   supabase functions deploy lead-score-worker
// Secrets:
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...

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

function norm(s: unknown) {
  return String(s ?? "").trim().toLowerCase();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function tempFromScore(score: number): "cold" | "warm" | "hot" {
  if (score >= 50) return "hot";
  if (score >= 20) return "warm";
  return "cold";
}

function scoreDelta(ev: any): number {
  const t = String(ev?.event_type ?? "");
  const meta = ev?.meta ?? {};
  if (t === "email_open") return 1;
  if (t === "link_click") {
    const url = norm(meta?.url ?? meta?.href ?? "");
    if (url.includes("pricing") || url.includes("checkout")) return 5;
    return 3;
  }
  if (t === "form_submitted") {
    const form = norm(meta?.form ?? meta?.formName ?? "");
    if (form.includes("webinar")) return 10;
    return 4;
  }
  if (t === "purchase") return 15;
  if (t === "purchase_upgraded") return 10;
  if (t === "purchase_cancelled") return -10;
  return 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body?.workspaceId ?? "default") || "default";
    const limit = Math.max(1, Math.min(500, Number(body?.limit ?? 200)));

    const cursorRows = await dbFetch(
      `lead_score_cursor?select=id,last_occurred_at,last_event_id&workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&limit=1`,
      { method: "GET" },
    );
    const cursor = Array.isArray(cursorRows) ? cursorRows[0] : null;
    const lastTs = cursor?.last_occurred_at ? String(cursor.last_occurred_at) : null;

    const events = await dbFetch(
      `contact_events?select=id,contact_id,event_type,occurred_at,meta&workspace_id=eq.${encodeURIComponent(workspaceId)}${lastTs ? `&occurred_at=gt.${encodeURIComponent(lastTs)}` : ""}&order=occurred_at.asc&limit=${limit}`,
      { method: "GET" },
    );
    const evs = Array.isArray(events) ? events : [];
    if (evs.length === 0) return json({ ok: true, processedEvents: 0, updatedContacts: 0 });

    // Aggregate deltas per contact
    const deltas = new Map<string, number>();
    for (const ev of evs) {
      const cid = String(ev.contact_id ?? "");
      if (!cid) continue;
      const d = scoreDelta(ev);
      if (!d) continue;
      deltas.set(cid, (deltas.get(cid) ?? 0) + d);
    }

    let updated = 0;
    for (const [contactId, delta] of deltas.entries()) {
      const rows = await dbFetch(
        `contacts?select=id,lead_score,temperature&workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(contactId)}&limit=1`,
        { method: "GET" },
      );
      const c = Array.isArray(rows) ? rows[0] : null;
      const current = Number(c?.lead_score ?? 0);
      const nextScore = clamp(current + delta, 0, 100);
      const nextTemp = tempFromScore(nextScore);

      await dbFetch(`contacts?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(contactId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          lead_score: nextScore,
          temperature: nextTemp,
          updated_at: new Date().toISOString(),
        }),
      });
      updated++;
    }

    // Advance cursor
    const last = evs[evs.length - 1];
    const patch = {
      workspace_id: workspaceId,
      last_occurred_at: last.occurred_at,
      last_event_id: last.id,
      updated_at: new Date().toISOString(),
    };
    if (cursor?.id) {
      await dbFetch(`lead_score_cursor?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(String(cursor.id))}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
    } else {
      await dbFetch("lead_score_cursor", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify([patch]),
      });
    }

    return json({ ok: true, processedEvents: evs.length, updatedContacts: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});


