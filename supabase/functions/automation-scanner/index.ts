// Supabase Edge Function: automation-scanner
//
// Scans new contact_events and starts automation runs for matching triggers.
// This makes Phase 3 "real": triggers fire automatically from incoming events.
//
// Deploy:
//   supabase functions deploy automation-scanner
//
// Secrets:
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
//
// Trigger:
// - Supabase Scheduled Triggers (cron): call every 1-5 minutes.

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

function getNextAfter(step: any, steps: any[]): string | null {
  const next = step?.config?.next;
  if (typeof next === "string" && next.length > 0) return next;
  const idx = Array.isArray(steps) ? steps.findIndex((s) => String(s?.id) === String(step?.id)) : -1;
  if (idx >= 0 && idx + 1 < steps.length) return String(steps[idx + 1]?.id ?? "") || null;
  return null;
}

function triggerMatches(triggerStep: any, ev: any): boolean {
  const kind = String(triggerStep?.config?.kind ?? "");
  const type = String(ev?.event_type ?? "");
  const meta = ev?.meta ?? {};

  if (kind === "trigger.form_submitted") {
    if (type !== "form_submitted") return false;
    const form = String(triggerStep?.config?.form ?? "").trim();
    if (!form) return true;
    return String(meta?.form ?? meta?.formName ?? "").trim() === form;
  }

  if (kind === "trigger.email_open") {
    if (type !== "email_open") return false;
    const campaignId = String(triggerStep?.config?.campaignId ?? "").trim();
    if (!campaignId) return true;
    return String(ev?.campaign_id ?? "").trim() === campaignId;
  }

  if (kind === "trigger.link_click") {
    if (type !== "link_click") return false;
    const campaignId = String(triggerStep?.config?.campaignId ?? "").trim();
    const urlContains = String(triggerStep?.config?.urlContains ?? "").trim().toLowerCase();
    if (campaignId && String(ev?.campaign_id ?? "").trim() !== campaignId) return false;
    if (urlContains) {
      const u = String(meta?.url ?? meta?.href ?? "").trim().toLowerCase();
      if (!u.includes(urlContains)) return false;
    }
    return true;
  }

  if (kind === "trigger.tag_added") {
    if (type !== "tag_added") return false;
    const tag = String(triggerStep?.config?.tag ?? "").trim().toLowerCase();
    if (!tag) return true;
    return String(meta?.tag ?? "").trim().toLowerCase().includes(tag);
  }

  if (kind === "trigger.tag_removed") {
    if (type !== "tag_removed") return false;
    const tag = String(triggerStep?.config?.tag ?? "").trim().toLowerCase();
    if (!tag) return true;
    return String(meta?.tag ?? "").trim().toLowerCase().includes(tag);
  }

  if (kind === "trigger.list_joined") {
    if (type !== "list_joined") return false;
    const list = String(triggerStep?.config?.list ?? "").trim().toLowerCase();
    if (!list) return true;
    return String(meta?.list ?? "").trim().toLowerCase().includes(list);
  }

  if (kind === "trigger.list_left") {
    if (type !== "list_left") return false;
    const list = String(triggerStep?.config?.list ?? "").trim().toLowerCase();
    if (!list) return true;
    return String(meta?.list ?? "").trim().toLowerCase().includes(list);
  }

  if (kind === "trigger.page_visited") {
    if (type !== "page_visited") return false;
    const urlContains = String(triggerStep?.config?.urlContains ?? "").trim().toLowerCase();
    if (!urlContains) return true;
    const u = String(meta?.url ?? meta?.href ?? "").trim().toLowerCase();
    return u.includes(urlContains);
  }

  if (kind === "trigger.purchase") return type === "purchase";
  if (kind === "trigger.purchase_upgraded") return type === "purchase_upgraded";
  if (kind === "trigger.purchase_cancelled") return type === "purchase_cancelled";

  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body?.workspaceId ?? "default") || "default";
    const limit = Math.max(1, Math.min(200, Number(body?.limit ?? 50)));

    // Load cursor (latest row)
    const cursorRows = await dbFetch(
      `automation_event_cursor?select=id,last_occurred_at,last_event_id&workspace_id=eq.${encodeURIComponent(workspaceId)}&order=updated_at.desc&limit=1`,
      { method: "GET" },
    );
    const cursor = Array.isArray(cursorRows) ? cursorRows[0] : null;
    const lastTs = cursor?.last_occurred_at ? String(cursor.last_occurred_at) : null;

    const events = await dbFetch(
      `contact_events?select=id,contact_id,event_type,title,occurred_at,meta,campaign_id&workspace_id=eq.${encodeURIComponent(workspaceId)}${lastTs ? `&occurred_at=gt.${encodeURIComponent(lastTs)}` : ""}&order=occurred_at.asc&limit=${limit}`,
      { method: "GET" },
    );
    const evs = Array.isArray(events) ? events : [];
    if (evs.length === 0) return json({ ok: true, processedEvents: 0, startedRuns: 0 });

    const automations = await dbFetch(
      `automations?select=id,name,status,steps&workspace_id=eq.${encodeURIComponent(workspaceId)}&status=eq.Running&limit=200`,
      { method: "GET" },
    );
    const autos = Array.isArray(automations) ? automations : [];

    let started = 0;
    for (const ev of evs) {
      for (const a of autos) {
        const steps = Array.isArray(a.steps) ? a.steps : [];
        const triggers = steps.filter((s: any) => s?.type === "trigger");
        for (const t of triggers) {
          if (!triggerMatches(t, ev)) continue;

          const nextStepId = getNextAfter(t, steps);
          if (!nextStepId) continue;

          // Create run
          const runRows = await dbFetch("automation_runs", {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify([{
              workspace_id: workspaceId,
              automation_id: String(a.id),
              contact_id: String(ev.contact_id),
              status: "running",
              current_step_id: nextStepId,
              meta: { triggered_by_event_id: ev.id, trigger_kind: t?.config?.kind ?? null },
            }]),
          });
          const run = Array.isArray(runRows) ? runRows[0] : null;
          if (!run?.id) continue;

          // Enqueue first step after trigger
          await dbFetch("automation_queue", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify([{
              workspace_id: workspaceId,
              run_id: run.id,
              automation_id: String(a.id),
              contact_id: String(ev.contact_id),
              step_id: nextStepId,
              execute_at: new Date().toISOString(),
              status: "queued",
              payload: { triggered_event_id: ev.id },
            }]),
          });

          started++;
        }
      }
    }

    // Advance cursor to last event
    const last = evs[evs.length - 1];
    const patch = {
      workspace_id: workspaceId,
      last_occurred_at: last.occurred_at,
      last_event_id: last.id,
      updated_at: new Date().toISOString(),
    };
    if (cursor?.id) {
      await dbFetch(`automation_event_cursor?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(String(cursor.id))}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
    } else {
      await dbFetch("automation_event_cursor", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify([patch]),
      });
    }

    return json({ ok: true, processedEvents: evs.length, startedRuns: started });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});


