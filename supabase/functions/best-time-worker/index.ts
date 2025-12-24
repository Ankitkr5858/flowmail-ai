// Supabase Edge Function: best-time-worker
//
// Learns best send time per contact by observing email_open events.
// Stores the most common open hour/minute (bucketed to 15-min increments) in contact fields:
// - best_send_hour
// - best_send_minute
//
// Deploy:
//   supabase functions deploy best-time-worker
// Secrets:
//   SUPABASE_SERVICE_ROLE_KEY=...

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

function toLocalHM(date: Date, timeZone: string): { h: number; m: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "9");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { h: Number.isFinite(h) ? h : 9, m: Number.isFinite(m) ? m : 0 };
}

function bucket15(m: number) {
  const b = Math.round(m / 15) * 15;
  return b === 60 ? 45 : Math.max(0, Math.min(45, b));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body?.workspaceId ?? "default") || "default";
    const limit = Math.max(1, Math.min(500, Number(body?.limit ?? 200)));

    const cursorRows = await dbFetch(
      `best_time_cursor?select=id,last_occurred_at,last_event_id&workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&limit=1`,
      { method: "GET" },
    );
    const cursor = Array.isArray(cursorRows) ? cursorRows[0] : null;
    const lastTs = cursor?.last_occurred_at ? String(cursor.last_occurred_at) : null;

    const events = await dbFetch(
      `contact_events?select=id,contact_id,event_type,occurred_at&workspace_id=eq.${encodeURIComponent(workspaceId)}&event_type=eq.email_open${lastTs ? `&occurred_at=gt.${encodeURIComponent(lastTs)}` : ""}&order=occurred_at.asc&limit=${limit}`,
      { method: "GET" },
    );
    const evs = Array.isArray(events) ? events : [];
    if (evs.length === 0) return json({ ok: true, processedEvents: 0, updatedContacts: 0 });

    // group opens by contact
    const byContact = new Map<string, string[]>();
    for (const ev of evs) {
      const cid = String(ev.contact_id ?? "");
      if (!cid) continue;
      const arr = byContact.get(cid) ?? [];
      arr.push(String(ev.occurred_at));
      byContact.set(cid, arr);
    }

    let updated = 0;
    for (const [contactId, times] of byContact.entries()) {
      const rows = await dbFetch(
        `contacts?select=id,timezone,best_send_hour,best_send_minute&workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(contactId)}&limit=1`,
        { method: "GET" },
      );
      const c = Array.isArray(rows) ? rows[0] : null;
      const tz = String(c?.timezone ?? "UTC");

      // Build a small histogram from the new events only (good enough for now)
      const counts = new Map<string, number>();
      for (const t of times) {
        const d = new Date(t);
        const { h, m } = toLocalHM(d, tz);
        const b = bucket15(m);
        const key = `${h}:${b}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      // Choose the best bucket; if tie, prefer latest bucket
      let bestKey: string | null = null;
      let bestCount = -1;
      for (const [k, v] of counts.entries()) {
        if (v > bestCount) {
          bestKey = k;
          bestCount = v;
        }
      }
      if (!bestKey) continue;
      const [hh, mm] = bestKey.split(":").map((x) => Number(x));

      await dbFetch(`contacts?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(contactId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          best_send_hour: hh,
          best_send_minute: mm,
          best_send_updated_at: new Date().toISOString(),
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
      await dbFetch(`best_time_cursor?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(String(cursor.id))}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
    } else {
      await dbFetch("best_time_cursor", {
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


