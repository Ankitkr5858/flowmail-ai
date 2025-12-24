// Supabase Edge Function: resend-webhook
//
// Purpose: Ingest Resend webhook events and update:
// - public.resend_events (raw)
// - public.email_sends (status/timestamps)
// - public.contacts suppression flags and counters
// - public.contact_events timeline
//
// Deploy:
//   supabase functions deploy resend-webhook
// Secrets (required):
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
// Optional hardening (recommended):
//   supabase secrets set RESEND_WEBHOOK_TOKEN=...   (and configure Resend webhook to include it in a header if possible)
//
// NOTE: Signature validation is provider-specific; implement once Resend signature details are confirmed.

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

function toWorkspaceId(payload: any): string {
  // Single-tenant default for now.
  return String(payload?.workspace_id ?? "default") || "default";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const token = Deno.env.get("RESEND_WEBHOOK_TOKEN");
    if (token) {
      const got = req.headers.get("x-webhook-token") ?? "";
      if (got !== token) return json({ error: "Unauthorized" }, 401);
    }

    const payload = await req.json().catch(() => null);
    if (!payload) return json({ error: "Invalid JSON" }, 400);

    const workspaceId = toWorkspaceId(payload);
    const eventType = String(payload?.type ?? payload?.event ?? "").trim();
    const data = payload?.data ?? payload;
    const providerMessageId = String(data?.email_id ?? data?.id ?? data?.emailId ?? "").trim();
    const toEmail = String(data?.to ?? data?.recipient ?? data?.email ?? "").trim();

    // Store raw event
    await dbFetch("resend_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{
        workspace_id: workspaceId,
        provider_message_id: providerMessageId || null,
        event_type: eventType || "unknown",
        payload,
      }]),
    });

    // Update email_sends if we can match provider_message_id
    if (providerMessageId) {
      const patch: any = { updated_at: new Date().toISOString() };
      const now = new Date().toISOString();
      if (eventType.includes("delivered")) { patch.status = "delivered"; patch.delivered_at = now; }
      if (eventType.includes("bounced")) { patch.status = "bounced"; patch.bounced_at = now; }
      if (eventType.includes("complain") || eventType.includes("complaint")) { patch.status = "complained"; patch.complained_at = now; }
      if (eventType.includes("open")) { patch.opened_at = now; }
      if (eventType.includes("click")) { patch.clicked_at = now; }

      await dbFetch(`email_sends?workspace_id=eq.${encodeURIComponent(workspaceId)}&provider=eq.resend&provider_message_id=eq.${encodeURIComponent(providerMessageId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });

      // Try to fetch the send row to find contact_id + campaign_id for event timeline
      const sendRows = await dbFetch(
        `email_sends?select=id,campaign_id,contact_id,to_email&workspace_id=eq.${encodeURIComponent(workspaceId)}&provider=eq.resend&provider_message_id=eq.${encodeURIComponent(providerMessageId)}&limit=1`,
        { method: "GET" },
      );
      const send = Array.isArray(sendRows) ? sendRows[0] : null;
      const contactId = send?.contact_id ? String(send.contact_id) : null;

      // Update contact flags/counters (best-effort)
      if (contactId) {
        const contactPatch: any = { updated_at: new Date().toISOString() };
        if (eventType.includes("open")) contactPatch.total_opens = (data?.total_opens_increment ?? null);
        if (eventType.includes("click")) contactPatch.total_clicks = (data?.total_clicks_increment ?? null);
        if (eventType.includes("bounced")) { contactPatch.bounced = true; }
        if (eventType.includes("complain") || eventType.includes("complaint")) { contactPatch.spam_complaint = true; }
        // We won't try to atomic-increment without a SQL RPC; keep it simple for now.
        // Instead: log a timeline event.

        try {
          if (Object.keys(contactPatch).length > 1) {
            await dbFetch(`contacts?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(contactId)}`, {
              method: "PATCH",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify(contactPatch),
            });
          }
        } catch {
          // ignore
        }

        const title =
          eventType.includes("open") ? "Email Opened" :
          eventType.includes("click") ? "Link Clicked" :
          eventType.includes("bounced") ? "Email Bounced" :
          (eventType.includes("complain") || eventType.includes("complaint")) ? "Spam Complaint" :
          eventType.includes("delivered") ? "Email Delivered" :
          "Email Event";

        await dbFetch("contact_events", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify([{
            workspace_id: workspaceId,
            contact_id: contactId,
            event_type: eventType || "email_event",
            title,
            occurred_at: new Date().toISOString(),
            meta: {
              provider: "resend",
              provider_message_id: providerMessageId,
              to: toEmail || send?.to_email || null,
              campaign_id: send?.campaign_id ?? null,
            },
            campaign_id: send?.campaign_id ?? null,
          }]),
        });
      }
    }

    return json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});


