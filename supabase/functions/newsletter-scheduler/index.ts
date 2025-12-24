// Supabase Edge Function: newsletter-scheduler
//
// Finds due rows in public.newsletter_schedules and enqueues email_sends for the linked campaign.
// Then advances next_run_at based on cadence.
//
// Deploy:
//   supabase functions deploy newsletter-scheduler
//
// Secrets:
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
//
// Trigger:
// - Supabase Dashboard → Scheduled Triggers → call this function every 5-15 minutes.

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

// NOTE: We do not deliver emails directly from this function.
// We only enqueue rows in `email_sends`. `email-send-worker` performs delivery via SMTP gateway.

function escapeHtml(s: string) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function blocksToHtml(blocks: any[] | null | undefined, fallbackBody?: string) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return `<div style="font-family: Inter, Arial, sans-serif; font-size: 14px; line-height: 1.55; color: #0f172a;">
      ${escapeHtml(fallbackBody ?? "").replaceAll("\n", "<br/>")}
    </div>`;
  }
  const parts: string[] = [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "header") parts.push(`<h1 style="margin: 0 0 12px; font-size: 22px;">${escapeHtml(String(b.text ?? ""))}</h1>`);
    else if (b.type === "text") parts.push(`<p style="margin: 0 0 12px; white-space: pre-wrap;">${escapeHtml(String(b.text ?? ""))}</p>`);
    else if (b.type === "button") {
      const href = String(b.href ?? "#");
      parts.push(`<p style="margin: 16px 0;">
        <a href="${escapeHtml(href)}" style="display:inline-block;background:#0284c7;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:700;">
          ${escapeHtml(String(b.text ?? "Learn more"))}
        </a>
      </p>`);
    } else if (b.type === "divider") {
      parts.push(`<hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0;" />`);
    }
  }
  return `<div style="font-family: Inter, Arial, sans-serif; font-size: 14px; line-height: 1.55; color: #0f172a;">${parts.join("")}</div>`;
}

function base64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = btoa(bin);
  return b64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function hmacSign(secret: string, payloadB64: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  return base64Url(new Uint8Array(sig));
}

async function makeUnsubscribeToken(secret: string, ws: string, contactId: string): Promise<string> {
  const payload = { ws, contactId, exp: Date.now() + 1000 * 60 * 60 * 24 * 365 }; // 1 year
  const payloadB64 = base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSign(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

function normalize(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}

function evalSegment(contact: any, seg: any): boolean {
  if (!seg || typeof seg !== 'object') return true;
  const logic = String(seg.logic ?? 'AND').toUpperCase() === 'OR' ? 'OR' : 'AND';
  const conds = Array.isArray(seg.conditions) ? seg.conditions : [];
  if (conds.length === 0) return true;

  const stage = normalize(contact.lifecycle_stage);
  const temp = normalize(contact.temperature);
  const tags: string[] = Array.isArray(contact.tags) ? contact.tags.map(normalize) : [];
  const lists: string[] = Array.isArray(contact.lists) ? contact.lists.map(normalize) : [];
  const leadScore = Number(contact.lead_score ?? 0);
  const status = String(contact.status ?? '');

  const check = (c: any) => {
    const field = String(c.field ?? '');
    const op = String(c.op ?? '');
    const value = c.value;
    if (field === 'lifecycleStage') return stage === normalize(value);
    if (field === 'temperature') return temp === normalize(value);
    if (field === 'status') return status === String(value);
    if (field === 'tag') return tags.some((t) => t === normalize(value) || t.includes(normalize(value)));
    if (field === 'list') return lists.some((t) => t === normalize(value) || t.includes(normalize(value)));
    if (field === 'leadScore') {
      const v = Number(value ?? 0);
      if (op === '>=') return leadScore >= v;
      if (op === '<=') return leadScore <= v;
      if (op === '>') return leadScore > v;
      if (op === '<') return leadScore < v;
    }
    return true;
  };

  return logic === 'AND' ? conds.every(check) : conds.some(check);
}

function nextWeekly(now: Date, dayOfWeek: number, hhmm: string): Date {
  const [hh, mm] = hhmm.split(":").map((x) => Number(x));
  const d = new Date(now);
  d.setUTCHours(Number.isFinite(hh) ? hh : 9, Number.isFinite(mm) ? mm : 0, 0, 0);
  const curDow = d.getUTCDay();
  const target = Math.max(0, Math.min(6, dayOfWeek));
  let delta = (target - curDow + 7) % 7;
  if (delta === 0 && d <= now) delta = 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

function nextMonthly(now: Date, dayOfMonth: number, hhmm: string): Date {
  const [hh, mm] = hhmm.split(":").map((x) => Number(x));
  const dom = Math.max(1, Math.min(28, dayOfMonth || 1));
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dom, Number.isFinite(hh) ? hh : 9, Number.isFinite(mm) ? mm : 0, 0, 0));
  if (d <= now) {
    const m = now.getUTCMonth() + 1;
    return new Date(Date.UTC(now.getUTCFullYear(), m, dom, Number.isFinite(hh) ? hh : 9, Number.isFinite(mm) ? mm : 0, 0, 0));
  }
  return d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body?.workspaceId ?? "default") || "default";
    const limitSchedules = Math.max(1, Math.min(10, Number(body?.limitSchedules ?? 3)));
    const limitRecipients = Math.max(1, Math.min(500, Number(body?.limitRecipients ?? 200)));
    const now = new Date();

    const schedules = await dbFetch(
      `newsletter_schedules?select=id,campaign_id,cadence,day_of_week,day_of_month,send_time,timezone,next_run_at,segment_json&workspace_id=eq.${encodeURIComponent(workspaceId)}&status=eq.active&next_run_at=lte.${encodeURIComponent(now.toISOString())}&order=next_run_at.asc&limit=${limitSchedules}`,
      { method: "GET" },
    );

    const due = Array.isArray(schedules) ? schedules : [];
    if (due.length === 0) return json({ ok: true, processed: 0 });

    let processed = 0;
    for (const s of due) {
      const scheduleId = String(s.id);
      const campaignId = String(s.campaign_id);

      const campRows = await dbFetch(
        `campaigns?select=id,name,subject,body,email_blocks&workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(campaignId)}&limit=1`,
        { method: "GET" },
      );
      const campaign = Array.isArray(campRows) ? campRows[0] : null;
      if (!campaign) continue;

      const subject = String(campaign.subject ?? campaign.name ?? "Newsletter").trim();

      const contacts = await dbFetch(
        `contacts?select=id,email,first_name,last_name,status,unsubscribed,bounced,spam_complaint,lifecycle_stage,temperature,tags,lists,lead_score&workspace_id=eq.${encodeURIComponent(workspaceId)}&status=eq.Subscribed&unsubscribed=is.false&bounced=is.false&spam_complaint=is.false&limit=${limitRecipients}`,
        { method: "GET" },
      );
      const segment = s.segment_json ?? null;
      const recipients = (Array.isArray(contacts) ? contacts : [])
        .filter((c: any) => evalSegment(c, segment))
        .map((c: any) => ({
          id: String(c.id ?? ""),
          email: String(c.email ?? "").trim(),
          firstName: String(c.first_name ?? "").trim(),
          lastName: String(c.last_name ?? "").trim(),
        }))
        .filter((c: any) => Boolean(c.email));

      if (recipients.length > 0) {
        const nowIso = new Date().toISOString();
        await dbFetch("email_sends", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(
            recipients.map((r: any) => ({
              workspace_id: workspaceId,
              campaign_id: campaignId,
              contact_id: r.id || null,
              to_email: r.email,
              subject,
              status: "queued",
              execute_at: nowIso,
              schedule_id: scheduleId,
              created_at: nowIso,
              updated_at: nowIso,
              meta: { source: "newsletter-scheduler" },
            })),
          ),
        });
      }

      // Advance next_run_at
      const cadence = String(s.cadence);
      const hhmm = String(s.send_time ?? "09:00");
      const next =
        cadence === "monthly"
          ? nextMonthly(now, Number(s.day_of_month ?? 1), hhmm)
          : nextWeekly(now, Number(s.day_of_week ?? 1), hhmm);

      await dbFetch(`newsletter_schedules?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(scheduleId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ last_run_at: now.toISOString(), next_run_at: next.toISOString(), updated_at: new Date().toISOString() }),
      });

      processed++;
    }

    return json({ ok: true, processed });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});


