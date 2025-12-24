// Supabase Edge Function: email-send-worker
//
// Processes queued rows in public.email_sends where:
// - status = 'queued'
// - execute_at <= now()
//
// Sends via an HTTP SMTP Gateway (Google SMTP Relay behind it) and updates provider_message_id + status + sent_at.
//
// Deploy:
//   supabase functions deploy email-send-worker
//
// Secrets:
//   SUPABASE_SERVICE_ROLE_KEY=...
//   MAIL_GATEWAY_URL=...          (ex: https://your-domain.com)
//   MAIL_GATEWAY_TOKEN=...        (Bearer token to protect gateway)
// Optional (tracking/compliance):
//   PUBLIC_FUNCTIONS_BASE_URL=... (ex: https://<project>.functions.supabase.co)
//   UNSUBSCRIBE_SIGNING_KEY=...   (for unsubscribe links)

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

async function gatewaySend(gatewayUrl: string, token: string, payload: any) {
  const res = await fetch(`${gatewayUrl.replace(/\/$/, "")}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Mail gateway error ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function loadWorkspaceSettings(workspaceId: string): Promise<{ companyName: string | null; defaultFromEmail: string | null } | null> {
  try {
    const rows = await dbFetch(
      `workspace_settings?select=company_name,default_from_email&workspace_id=eq.${encodeURIComponent(workspaceId)}&limit=1`,
      { method: "GET" },
    );
    const r = Array.isArray(rows) ? rows[0] : null;
    if (!r) return null;
    return {
      companyName: r.company_name ? String(r.company_name) : null,
      defaultFromEmail: r.default_from_email ? String(r.default_from_email) : null,
    };
  } catch {
    return null;
  }
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
  let out = body ?? "";
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{{${k}}}`, v);
  return `<div style="font-family: Inter, Arial, sans-serif; font-size: 14px; line-height: 1.55; color: #0f172a; white-space: pre-wrap;">${escapeHtml(out)}</div>`;
}

function blocksToHtml(
  blocks: any[] | null | undefined,
  vars: Record<string, string>,
  fallbackBody: string | undefined,
  trackingBase: string | null,
  sid: string,
) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return `<div style="font-family: Inter, Arial, sans-serif; font-size: 14px; line-height: 1.55; color: #0f172a;">
      ${escapeHtml(applyVars(fallbackBody ?? "", vars)).replaceAll("\n", "<br/>")}
    </div>`;
  }
  const parts: string[] = [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "header") parts.push(`<h1 style="margin: 0 0 12px; font-size: 22px;">${escapeHtml(applyVars(String(b.text ?? ""), vars))}</h1>`);
    else if (b.type === "text") parts.push(`<p style="margin: 0 0 12px; white-space: pre-wrap;">${escapeHtml(applyVars(String(b.text ?? ""), vars))}</p>`);
    else if (b.type === "button") {
      const href = String(b.href ?? "#");
      const bid = String(b.id ?? "").trim();
      const trackedHref =
        trackingBase && href && href.startsWith("http")
          ? `${trackingBase.replace(/\/$/, "")}/track/click?sid=${encodeURIComponent(sid)}&bid=${encodeURIComponent(bid || "btn")}&url=${encodeURIComponent(href)}`
          : href;
      parts.push(`<p style="margin: 16px 0;">
        <a href="${escapeHtml(trackedHref)}" style="display:inline-block;background:#0284c7;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:700;">
          ${escapeHtml(applyVars(String(b.text ?? "Learn more"), vars))}
        </a>
      </p>`);
    } else if (b.type === "divider") {
      parts.push(`<hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0;" />`);
    } else if (b.type === "image") {
      parts.push(`<p style="margin: 14px 0;"><img src="${escapeHtml(String(b.src ?? ""))}" alt="${escapeHtml(String(b.alt ?? ""))}" style="max-width:100%;border-radius:12px;border:1px solid #e2e8f0;" /></p>`);
    } else {
      // Unknown block types: ignore
    }
  }
  return `<div style="font-family: Inter, Arial, sans-serif; font-size: 14px; line-height: 1.55; color: #0f172a;">${parts.join("")}</div>`;
}

function rewriteLinks(html: string, base: string, sid: string): string {
  if (!base) return html;
  // Replace href="https://..." with tracking redirect.
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (_m, url) => {
    const u = String(url);
    // Don't double-wrap links we already generated for tracking (includes bid)
    if (u.includes("/track/click?sid=")) return `href="${u}"`;
    const tracked = `${base.replace(/\/$/, "")}/track/click?sid=${encodeURIComponent(sid)}&url=${encodeURIComponent(u)}`;
    return `href="${tracked}"`;
  });
}

async function makeUnsubUrl(workspaceId: string, contactId: string): Promise<string | null> {
  const secret = Deno.env.get("UNSUBSCRIBE_SIGNING_KEY") ?? "";
  const base = Deno.env.get("PUBLIC_FUNCTIONS_BASE_URL") ?? "";
  if (!secret || !base) return null;

  const payload = { ws: workspaceId, contactId, exp: Date.now() + 1000 * 60 * 60 * 24 * 365 };
  const enc = new TextEncoder();
  let bin = '';
  const bytes = enc.encode(JSON.stringify(payload));
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const payloadB64 = btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  let sbin = '';
  new Uint8Array(sig).forEach((b) => (sbin += String.fromCharCode(b)));
  const sigB64 = btoa(sbin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

  const token = `${payloadB64}.${sigB64}`;
  return `${base.replace(/\/$/, "")}/unsubscribe?token=${encodeURIComponent(token)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const gatewayUrl = Deno.env.get("MAIL_GATEWAY_URL") ?? "";
    const gatewayToken = Deno.env.get("MAIL_GATEWAY_TOKEN") ?? "";
    if (!gatewayUrl) return json({ error: "Missing MAIL_GATEWAY_URL secret" }, 500);
    if (!gatewayToken) return json({ error: "Missing MAIL_GATEWAY_TOKEN secret" }, 500);
    const functionBase = Deno.env.get("PUBLIC_FUNCTIONS_BASE_URL") ?? "";

    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body?.workspaceId ?? "default") || "default";
    const batch = Math.max(1, Math.min(25, Number(body?.batch ?? 10)));
    const nowIso = new Date().toISOString();

    const rows = await dbFetch(
      `email_sends?select=id,campaign_id,contact_id,to_email,from_email,subject,meta&workspace_id=eq.${encodeURIComponent(workspaceId)}&status=eq.queued&execute_at=lte.${encodeURIComponent(nowIso)}&order=execute_at.asc&limit=${batch}`,
      { method: "GET" },
    );
    const items = Array.isArray(rows) ? rows : [];
    if (items.length === 0) return json({ ok: true, processed: 0 });

    // Load campaigns once (small N) — note: some queued sends (automations/notify) may not have a campaign row.
    const campaignIds = Array.from(new Set(items.map((x: any) => String(x.campaign_id ?? "")).filter(Boolean)));
    const campRows = campaignIds.length
      ? await dbFetch(`campaigns?select=id,subject,body,email_blocks&workspace_id=eq.${encodeURIComponent(workspaceId)}&id=in.(${campaignIds.map(encodeURIComponent).join(",")})`, { method: "GET" })
      : [];
    const campById = new Map<string, any>();
    (Array.isArray(campRows) ? campRows : []).forEach((c: any) => campById.set(String(c.id), c));

    // Settings used for personalization + sender display name
    const wsSettings = await loadWorkspaceSettings(workspaceId);
    const companyName = (wsSettings?.companyName ?? "").trim() || null;

    let processed = 0;
    for (const it of items) {
      const id = String(it.id);
      const to = String(it.to_email ?? "").trim();
      const defaultFromEmailSecret = (Deno.env.get("DEFAULT_FROM_EMAIL") ?? "").trim();
      const defaultFromEmailSetting = (wsSettings?.defaultFromEmail ?? "").trim();
      const fromEmail = String(it.from_email ?? "").trim() || defaultFromEmailSecret || defaultFromEmailSetting || null;
      const campaignId = String(it.campaign_id ?? "").trim();
      const contactId = it.contact_id ? String(it.contact_id) : null;

      // mark processing
      await dbFetch(`email_sends?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "processing", updated_at: new Date().toISOString() }),
      });

      try {
        const campaign = campById.get(campaignId);
        const subj = String(it.subject ?? campaign?.subject ?? "Message").trim();
        const meta = it.meta ?? {};
        const bodyText = String((meta as any)?.body ?? campaign?.body ?? "").trim();

        // Minimal personalization
        let firstName = "";
        let lastName = "";
        if (contactId) {
          const cr = await dbFetch(
            `contacts?select=first_name,last_name,email&workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(contactId)}&limit=1`,
            { method: "GET" },
          );
          const c = Array.isArray(cr) ? cr[0] : null;
          firstName = String(c?.first_name ?? "").trim();
          lastName = String(c?.last_name ?? "").trim();
        }

        const senderName = companyName || (Deno.env.get("DEFAULT_FROM_NAME") ?? "").trim() || "FlowMail";
        const vars = { firstName, lastName, email: to, companyName: companyName || "", senderName };
        const blocks = campaign?.email_blocks;
        const trackingBase = functionBase ? functionBase.replace(/\/$/, "") : null;
        let html = Array.isArray(blocks) && blocks.length > 0
          ? blocksToHtml(blocks, vars, bodyText, trackingBase, id)
          : renderSimpleEmail(bodyText, vars);
        // Tracking pixel + click redirect (if configured)
        if (functionBase) {
          const base = functionBase.replace(/\/$/, "");
          html = rewriteLinks(html, base, id);
          html = `${html}<img src="${base}/track/open?sid=${encodeURIComponent(id)}" width="1" height="1" alt="" />`;
        }
        // Unsubscribe footer if we can build a link
        if (contactId) {
          const unsub = await makeUnsubUrl(workspaceId, contactId);
          if (unsub) {
            html = `${html}<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;"><a href="${unsub}" style="color:#64748b;">Unsubscribe</a></div>`;
          }
        }

        const from = fromEmail ? `"${senderName.replaceAll('"', "")}" <${fromEmail}>` : undefined;
        const sendRes = await gatewaySend(gatewayUrl, gatewayToken, { to, subject: subj, html, from });
        const providerId = String(sendRes?.messageId ?? "");

        await dbFetch(`email_sends?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            provider: "smtp",
            provider_message_id: providerId || null,
            from_email: fromEmail,
            status: "sent",
            sent_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            meta,
          }),
        });

        processed++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await dbFetch(`email_sends?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "failed", meta: { error: msg }, updated_at: new Date().toISOString() }),
        });
      }
    }

    return json({ ok: true, processed });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});


