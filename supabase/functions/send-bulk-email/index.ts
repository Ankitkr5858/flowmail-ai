// Supabase Edge Function: send-bulk-email
// Deploy:
//   supabase functions deploy send-bulk-email
//
// Frontend calls:
//   supabase.functions.invoke('send-bulk-email', { body: { workspaceId?, subject, body, maxRecipients?, pageSize?, segmentJson?, contactIds?, sendImmediately?, dryRun? } })
//
// By default this function enqueues rows into `email_sends`; `email-send-worker` performs delivery.
// If `sendImmediately=true`, we send synchronously via Resend (requires RESEND_API_KEY) and record `email_sends` as sent/failed.

// Avoid TS errors in the Vite workspace: these globals exist in the Supabase Edge runtime.
declare const Deno: any;

const BULK_CAMPAIGN_ID = "bulk_email"; // required because email_sends.campaign_id is NOT NULL in schema
const MAX_IMMEDIATE_RECIPIENTS = 50;

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

function normalize(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

function escapeHtml(s: string) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function applyVars(s: string, vars: Record<string, string>) {
  let out = s ?? "";
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{{${k}}}`, v);
  return out;
}

function renderSimpleEmail(body: string, vars: Record<string, string>) {
  const out = applyVars(body ?? "", vars);
  return `<div style="font-family: Inter, Arial, sans-serif; font-size: 14px; line-height: 1.55; color: #0f172a; white-space: pre-wrap;">${escapeHtml(out)}</div>`;
}

async function resendSend(apiKey: string, payload: { to: string; subject: string; html?: string; from: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

// SegmentDefinition-compatible evaluator (same shape as UI + schedulers).
function evalSegment(contact: any, seg: any): boolean {
  if (!seg || typeof seg !== "object") return true;
  const logic = String(seg.logic ?? "AND").toUpperCase() === "OR" ? "OR" : "AND";
  const conds = Array.isArray(seg.conditions) ? seg.conditions : [];
  if (conds.length === 0) return true;

  const stage = normalize(contact.lifecycle_stage);
  const temp = normalize(contact.temperature);
  const tags: string[] = Array.isArray(contact.tags) ? contact.tags.map(normalize) : [];
  const lists: string[] = Array.isArray(contact.lists) ? contact.lists.map(normalize) : [];
  const leadScore = Number(contact.lead_score ?? 0);
  const status = String(contact.status ?? "");

  const check = (c: any) => {
    const field = String(c.field ?? "");
    const op = String(c.op ?? "");
    const value = c.value;
    if (field === "lifecycleStage") return stage === normalize(value);
    if (field === "temperature") return temp === normalize(value);
    if (field === "status") return status === String(value ?? "");
    if (field === "tag") return tags.some((t) => t === normalize(value) || t.includes(normalize(value)));
    if (field === "list") return lists.some((t) => t === normalize(value) || t.includes(normalize(value)));
    if (field === "leadScore") {
      const v = Number(value ?? 0);
      if (op === ">=") return leadScore >= v;
      if (op === "<=") return leadScore <= v;
      if (op === ">") return leadScore > v;
      if (op === "<") return leadScore < v;
    }
    return true;
  };

  return logic === "AND" ? conds.every(check) : conds.some(check);
}

// Minimal PostgREST access with the user's JWT (RLS applies).
async function pgFetch(req: Request, path: string, init?: RequestInit) {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Error("Missing SUPABASE_URL / SUPABASE_ANON_KEY in Edge Function env");
  const auth = req.headers.get("Authorization") ?? "";
  const headers: Record<string, string> = {
    apikey: anon,
    Authorization: auth,
    "Content-Type": "application/json",
    ...(init?.headers as any),
  };
  const res = await fetch(`${url}/rest/v1/${path}`, { ...(init ?? {}), headers });
  const body = await res.text();
  if (!res.ok) throw new Error(`DB error ${res.status}: ${body}`);
  return body ? JSON.parse(body) : null;
}

async function ensureBulkCampaign(req: Request, workspaceId: string) {
  const existing = await pgFetch(
    req,
    `campaigns?select=id&workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(BULK_CAMPAIGN_ID)}&limit=1`,
    { method: "GET" },
  );
  const found = Array.isArray(existing) && existing.length > 0;
  if (found) return;

  const now = new Date().toISOString();
  await pgFetch(req, "campaigns", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify([
      {
        workspace_id: workspaceId,
        id: BULK_CAMPAIGN_ID,
        name: "Bulk Email (system)",
        status: "Draft",
        date: "",
        subject: null,
        body: null,
        segment_name: "__system_bulk__",
        created_at: now,
        updated_at: now,
      },
    ]),
  });
}

function chunk<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

function toInList(ids: string[]): string {
  // Encode each item but keep commas/parentheses unencoded for PostgREST parsing.
  return ids
    .map((id) => {
      const safe = String(id ?? "").replaceAll('"', '\\"');
      return encodeURIComponent(`"${safe}"`);
    })
    .join(",");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const defaultFromEmail = (Deno.env.get("DEFAULT_FROM_EMAIL") ?? "").trim();
    const defaultFromName = (Deno.env.get("DEFAULT_FROM_NAME") ?? "").trim() || "FlowMail";
    const resendApiKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body?.workspaceId ?? "default").trim() || "default";

    const subject = String(body?.subject ?? "").trim();
    const textBody = String(body?.body ?? "").trim();
    const dryRun = Boolean(body?.dryRun);
    const sendImmediately = Boolean(body?.sendImmediately);
    const sampleSize = Math.max(0, Math.min(25, Number(body?.sampleSize ?? 10)));
    const segmentJson = body?.segmentJson ?? null;
    const contactIdsRaw = body?.contactIds;
    const contactIds =
      Array.isArray(contactIdsRaw) ? contactIdsRaw.map((x: any) => String(x ?? "").trim()).filter(Boolean) : [];

    const maxRecipientsRaw = Number(body?.maxRecipients ?? 1000);
    const maxRecipients = Math.max(1, Math.min(10000, maxRecipientsRaw));
    const pageSizeRaw = Number(body?.pageSize ?? 500);
    const pageSize = Math.max(1, Math.min(1000, pageSizeRaw));

    if (!subject) return json({ error: "Missing subject" }, 400);
    if (!textBody) return json({ error: "Missing body" }, 400);

    const recipients: Array<{ id: string; email: string; firstName: string; lastName: string }> = [];

    if (contactIds.length > 0) {
      // Fetch only selected contacts (still enforcing eligible rules server-side).
      const limitedIds = contactIds.slice(0, maxRecipients);
      const batches = chunk(limitedIds, 200);
      for (const ids of batches) {
        const rows = await pgFetch(
          req,
          `contacts?select=id,email,first_name,last_name,status,unsubscribed,bounced,spam_complaint,lifecycle_stage,temperature,tags,lists,lead_score&workspace_id=eq.${encodeURIComponent(workspaceId)}&status=eq.Subscribed&unsubscribed=is.false&bounced=is.false&spam_complaint=is.false&id=in.(${toInList(ids)})&limit=${ids.length}`,
          { method: "GET" },
        );
        (Array.isArray(rows) ? rows : []).forEach((c: any) => {
          const email = String(c.email ?? "").trim();
          if (!email) return;
          recipients.push({
            id: String(c.id ?? ""),
            email,
            firstName: String(c.first_name ?? "").trim(),
            lastName: String(c.last_name ?? "").trim(),
          });
        });
      }
    } else {
      // Load recipients (subscribed + not suppressed), paged, then (optionally) segment-filtered.
      let offset = 0;
      while (recipients.length < maxRecipients) {
        const remaining = maxRecipients - recipients.length;
        const fetchN = Math.max(1, Math.min(pageSize, remaining));
        const contacts = await pgFetch(
          req,
          `contacts?select=id,email,first_name,last_name,status,unsubscribed,bounced,spam_complaint,lifecycle_stage,temperature,tags,lists,lead_score&workspace_id=eq.${encodeURIComponent(workspaceId)}&status=eq.Subscribed&unsubscribed=is.false&bounced=is.false&spam_complaint=is.false&order=created_at.asc&limit=${fetchN}&offset=${offset}`,
          { method: "GET" },
        );
        const rows = Array.isArray(contacts) ? contacts : [];
        if (rows.length === 0) break;
        offset += rows.length;

        for (const c of rows) {
          if (recipients.length >= maxRecipients) break;
          if (segmentJson && !evalSegment(c, segmentJson)) continue;
          const email = String(c.email ?? "").trim();
          if (!email) continue;
          recipients.push({
            id: String(c.id ?? ""),
            email,
            firstName: String(c.first_name ?? "").trim(),
            lastName: String(c.last_name ?? "").trim(),
          });
        }
      }
    }

    if (dryRun) {
      return json({
        ok: true,
        dryRun: true,
        workspaceId,
        eligibleCount: recipients.length,
        maxRecipients,
        pageSize,
        fromEmail: defaultFromEmail || null,
        segmentApplied: Boolean(segmentJson),
        selectedCount: contactIds.length > 0 ? contactIds.length : null,
        canSendImmediately: Boolean(resendApiKey) && recipients.length <= MAX_IMMEDIATE_RECIPIENTS,
        sampleEmails: recipients.slice(0, sampleSize).map((r: any) => r.email),
      });
    }

    if (recipients.length === 0) return json({ queued: 0, message: "No eligible recipients" });

    // `email_sends.campaign_id` is NOT NULL in schema, so we use a system campaign id.
    await ensureBulkCampaign(req, workspaceId);

    const now = new Date().toISOString();
    const meta = {
      source: "send-bulk-email",
      body: textBody,
      segment: contactIds.length > 0 ? null : (segmentJson ?? null),
      selected_contact_ids: contactIds.length > 0 ? contactIds.slice(0, maxRecipients) : null,
    };

    if (sendImmediately) {
      if (!resendApiKey) return json({ error: "RESEND_API_KEY not set. Instant send requires Resend." }, 500);
      if (!defaultFromEmail) return json({ error: "DEFAULT_FROM_EMAIL not set. Instant send requires a from address." }, 500);
      if (recipients.length > MAX_IMMEDIATE_RECIPIENTS) {
        return json({ error: `Too many recipients for instant send (${recipients.length}). Reduce to <= ${MAX_IMMEDIATE_RECIPIENTS} or use queued mode.` }, 400);
      }

      const from = `"${defaultFromName.replaceAll('"', "")}" <${defaultFromEmail}>`;
      const results: Array<{ ok: boolean; providerId?: string; error?: string; r: any }> = [];

      // Send with small concurrency to keep within function limits.
      const batches = chunk(recipients, 5);
      for (const b of batches) {
        const settled = await Promise.allSettled(
          b.map(async (r) => {
            const vars = {
              firstName: String(r.firstName ?? ""),
              lastName: String(r.lastName ?? ""),
              email: String(r.email ?? ""),
              companyName: "",
              senderName: defaultFromName,
            };
            const html = renderSimpleEmail(textBody, vars);
            const resp = await resendSend(resendApiKey, { to: r.email, subject, html, from });
            const id = String(resp?.id ?? resp?.data?.id ?? "").trim();
            return { r, id };
          }),
        );
        settled.forEach((s, idx) => {
          const r = b[idx];
          if (s.status === "fulfilled") results.push({ ok: true, providerId: s.value.id, r });
          else {
            const msg = s.reason instanceof Error ? s.reason.message : String(s.reason);
            results.push({ ok: false, error: msg, r });
          }
        });
      }

      const sent = results.filter((x) => x.ok).length;
      const failed = results.filter((x) => !x.ok).length;

      // Record results in email_sends for reporting/tracking updates.
      const inserts = results.map((x) => ({
        workspace_id: workspaceId,
        campaign_id: BULK_CAMPAIGN_ID,
        contact_id: x.r.id || null,
        to_email: x.r.email,
        from_email: defaultFromEmail,
        subject,
        provider: "resend",
        provider_message_id: x.ok ? (x.providerId || null) : null,
        status: x.ok ? "sent" : "failed",
        execute_at: now,
        sent_at: x.ok ? now : null,
        created_at: now,
        updated_at: now,
        meta: x.ok ? meta : { ...meta, error: x.error || "Send failed" },
      }));

      for (let i = 0; i < inserts.length; i += pageSize) {
        await pgFetch(req, "email_sends", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(inserts.slice(i, i + pageSize)),
        });
      }

      const errorSamples = results
        .filter((x) => !x.ok)
        .slice(0, 5)
        .map((x) => ({ to: String(x.r?.email ?? ""), error: String(x.error ?? "Send failed") }));
      return json({ mode: "instant", sent, failed, from: defaultFromEmail, errors: errorSamples });
    }

    // Queue mode (default). Delivery is handled by `email-send-worker`.
    for (let i = 0; i < recipients.length; i += pageSize) {
      const batch = recipients.slice(i, i + pageSize);
      const inserts = batch.map((r: any) => ({
        workspace_id: workspaceId,
        campaign_id: BULK_CAMPAIGN_ID,
        contact_id: r.id || null,
        to_email: r.email,
        from_email: defaultFromEmail || null,
        subject,
        status: "queued",
        execute_at: now,
        created_at: now,
        updated_at: now,
        meta,
      }));
      await pgFetch(req, "email_sends", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(inserts),
      });
    }

    return json({ queued: recipients.length, maxRecipients, pageSize, segmentApplied: Boolean(segmentJson) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});

