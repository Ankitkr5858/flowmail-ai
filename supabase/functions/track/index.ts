// Supabase Edge Function: track
//
// Open pixel:
//   GET /track/open?sid=<email_sends.id>
// Click redirect:
//   GET /track/click?sid=<email_sends.id>&url=<encoded>&bid=<blockId>
//
// This replaces Resend webhooks when using SMTP relay.
//
// Deploy:
//   supabase functions deploy track
//
// Secrets:
//   SUPABASE_SERVICE_ROLE_KEY=...

declare const Deno: any;

function gif1x1(): Uint8Array {
  // Transparent 1x1 GIF
  return new Uint8Array([
    71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33, 249, 4, 1, 0, 0, 0, 0,
    44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
  ]);
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

async function bumpMetric(workspaceId: string, contactId: string, metric: "open" | "click") {
  // Call SQL function (added in schema.sql)
  await dbFetch(`rpc/bump_contact_metric`, {
    method: "POST",
    body: JSON.stringify({ p_workspace_id: workspaceId, p_contact_id: contactId, p_metric: metric }),
  });
}

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const sid = u.searchParams.get("sid") ?? "";
    if (!sid) return new Response("ok", { status: 200 });

    const path = u.pathname;
    const nowIso = new Date().toISOString();

    // Load send row
    const rows = await dbFetch(
      `email_sends?select=workspace_id,id,contact_id,campaign_id,to_email,opened_at,clicked_at&id=eq.${encodeURIComponent(sid)}&limit=1`,
      { method: "GET" },
    );
    const send = Array.isArray(rows) ? rows[0] : null;
    if (!send) {
      // still return pixel/redirect
      if (path.endsWith("/click")) {
        const url = u.searchParams.get("url") ?? "";
        return new Response(null, { status: 302, headers: { Location: url || "https://example.com" } });
      }
      return new Response(gif1x1(), { status: 200, headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" } });
    }

    const workspaceId = String(send.workspace_id ?? "default") || "default";
    const contactId = send.contact_id ? String(send.contact_id) : null;
    const campaignId = String(send.campaign_id ?? "");

    if (path.endsWith("/open")) {
      // idempotent-ish: only set opened_at if null
      if (!send.opened_at) {
        await dbFetch(`email_sends?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(sid)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ opened_at: nowIso, updated_at: nowIso }),
        });
        if (contactId) {
          await bumpMetric(workspaceId, contactId, "open");
          await dbFetch("contact_events", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify([{
              workspace_id: workspaceId,
              contact_id: contactId,
              event_type: "email_open",
              title: "Email Opened",
              occurred_at: nowIso,
              campaign_id: campaignId || null,
              meta: { sid },
            }]),
          });
        }
      }
      return new Response(gif1x1(), { status: 200, headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" } });
    }

    if (path.endsWith("/click")) {
      const url = u.searchParams.get("url") ?? "";
      const bid = u.searchParams.get("bid") ?? "";
      const isFirstClick = !send.clicked_at;
      if (isFirstClick) {
        await dbFetch(`email_sends?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(sid)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ clicked_at: nowIso, updated_at: nowIso }),
        });
      }
      if (contactId) {
        // Keep contact metric increment as "first click per send" so we don't inflate totals.
        if (isFirstClick) await bumpMetric(workspaceId, contactId, "click");

        // Always record every click event (used for real link + block heatmaps).
        await dbFetch("contact_events", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify([{
            workspace_id: workspaceId,
            contact_id: contactId,
            event_type: "link_click",
            title: "Link Clicked",
            occurred_at: nowIso,
            campaign_id: campaignId || null,
            meta: { sid, url, bid: String(bid || ""), first: isFirstClick },
          }]),
        });
      }
      return new Response(null, { status: 302, headers: { Location: url || "https://example.com" } });
    }

    return new Response("ok", { status: 200 });
  } catch {
    // Always succeed for tracking endpoints
    return new Response("ok", { status: 200 });
  }
});


