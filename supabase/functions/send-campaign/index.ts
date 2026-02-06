// Supabase Edge Function: send-campaign
// Deploy:
//   supabase functions deploy send-campaign
//
// Frontend calls:
//   supabase.functions.invoke('send-campaign', { body: { campaignId, workspaceId?, maxRecipients?, pageSize?, segmentJson?, dryRun? } })

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

function escapeHtml(s: string) {
  return s
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
    } else if (b.type === "image") {
      parts.push(`<p style="margin: 14px 0;"><img src="${escapeHtml(String(b.src ?? ""))}" alt="${escapeHtml(String(b.alt ?? ""))}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;" /></p>`);
    } else {
      // Unknown block types: ignore for now
    }
  }
  return `<div style="font-family: Inter, Arial, sans-serif; font-size: 14px; line-height: 1.55; color: #0f172a;">${parts.join("")}</div>`;
}

// NOTE: We no longer send directly from this function.
// We only enqueue rows into `email_sends`; `email-send-worker` performs SMTP delivery.

function normalize(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}

// SegmentDefinition-compatible evaluator (same shape as UI + campaign/newsletter schedulers).
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const defaultFromEmail = (Deno.env.get("DEFAULT_FROM_EMAIL") ?? "").trim();
    const body = await req.json().catch(() => ({}));
    const campaignId = String(body?.campaignId ?? "").trim();
    const workspaceId = String(body?.workspaceId ?? "default").trim() || "default";
    // Backwards compatibility:
    // - `limit` used to cap recipients for the whole send.
    // New:
    // - `maxRecipients` is the total cap across all pages
    // - `pageSize` controls how many contacts we fetch/insert per chunk
    const legacyLimit = Number(body?.limit ?? NaN);
    const maxRecipientsRaw = Number(body?.maxRecipients ?? (Number.isFinite(legacyLimit) ? legacyLimit : 1000));
    const maxRecipients = Math.max(1, Math.min(10000, maxRecipientsRaw));
    const pageSizeRaw = Number(body?.pageSize ?? 500);
    const pageSize = Math.max(1, Math.min(1000, pageSizeRaw));
    const dryRun = Boolean(body?.dryRun);
    const sampleSize = Math.max(0, Math.min(25, Number(body?.sampleSize ?? 10)));
    const segmentJson = body?.segmentJson ?? null;
    if (!campaignId) return json({ error: "Missing campaignId" }, 400);

    // Load campaign
    const campaignRows = await pgFetch(
      req,
      `campaigns?select=id,name,subject,body,email_blocks,status&workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(campaignId)}&limit=1`,
      { method: "GET" },
    );
    const campaign = Array.isArray(campaignRows) ? campaignRows[0] : null;
    if (!campaign) return json({ error: "Campaign not found" }, 404);

    const subject = String(campaign.subject ?? campaign.name ?? "Campaign").trim();

    // Load recipients (subscribed + not suppressed), paged, then (optionally) segment-filtered.
    const recipients: Array<{ id: string; email: string; firstName: string; lastName: string }> = [];
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

    if (dryRun) {
      return json({
        ok: true,
        dryRun: true,
        campaignId,
        workspaceId,
        eligibleCount: recipients.length,
        maxRecipients,
        pageSize,
        fromEmail: defaultFromEmail || null,
        segmentApplied: Boolean(segmentJson),
        sampleEmails: recipients.slice(0, sampleSize).map((r: any) => r.email),
      });
    }

    if (recipients.length === 0) return json({ queued: 0, message: "No eligible recipients" });

    // Enqueue per-recipient. SMTP delivery is handled by `email-send-worker`.
    const now = new Date().toISOString();
    const meta = {
      source: "send-campaign",
      segment: segmentJson ?? null,
      // Keep a small payload; avoid dumping huge objects in meta.
    };
    for (let i = 0; i < recipients.length; i += pageSize) {
      const batch = recipients.slice(i, i + pageSize);
      const inserts = batch.map((r: any) => ({
        workspace_id: workspaceId,
        campaign_id: campaignId,
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

    // Update campaign basic counters (delivered assumed = sent) via PostgREST PATCH
    try {
      await pgFetch(req, `campaigns?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(campaignId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "Sent",
          sent_count: recipients.length,
          open_count: 0,
          click_count: 0,
          conversion_count: 0,
          open_rate: "0.0%",
          click_rate: "0.0%",
          updated_at: new Date().toISOString(),
        }),
      });
    } catch {
      // ignore counter update errors (emails were queued)
    }

    return json({ queued: recipients.length, maxRecipients, pageSize, segmentApplied: Boolean(segmentJson) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});


