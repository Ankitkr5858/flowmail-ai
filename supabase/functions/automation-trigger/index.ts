// Supabase Edge Function: automation-trigger
//
// Creates an automation_run and enqueues the first actionable step for a contact.
// This is a minimal building block for Phase 3.
//
// Deploy:
//   supabase functions deploy automation-trigger
// Secrets:
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...

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

function findFirstNextStep(steps: any[]): string | null {
  if (!Array.isArray(steps) || steps.length === 0) return null;
  // If there is a trigger with `next`, use it; else just take first step id.
  const trigger = steps.find((s) => s?.type === "trigger" && typeof s?.config?.next === "string");
  if (trigger?.config?.next) return String(trigger.config.next);
  return String(steps[0]?.id ?? "") || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body?.workspaceId ?? "default") || "default";
    const automationId = String(body?.automationId ?? "").trim();
    const contactId = String(body?.contactId ?? "").trim();
    if (!automationId) return json({ error: "Missing automationId" }, 400);
    if (!contactId) return json({ error: "Missing contactId" }, 400);

    const rows = await dbFetch(
      `automations?select=id,steps&workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(automationId)}&limit=1`,
      { method: "GET" },
    );
    const automation = Array.isArray(rows) ? rows[0] : null;
    if (!automation) return json({ error: "Automation not found" }, 404);

    const steps = automation.steps ?? [];
    const firstStepId = findFirstNextStep(steps);
    if (!firstStepId) return json({ error: "Automation has no steps" }, 400);

    // Create run
    const runRows = await dbFetch("automation_runs", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify([{
        workspace_id: workspaceId,
        automation_id: automationId,
        contact_id: contactId,
        status: "running",
        current_step_id: firstStepId,
      }]),
    });
    const run = Array.isArray(runRows) ? runRows[0] : null;
    if (!run?.id) return json({ error: "Failed to create run" }, 500);

    // Enqueue
    await dbFetch("automation_queue", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{
        workspace_id: workspaceId,
        run_id: run.id,
        automation_id: automationId,
        contact_id: contactId,
        step_id: firstStepId,
        execute_at: new Date().toISOString(),
        status: "queued",
      }]),
    });

    return json({ ok: true, runId: run.id, stepId: firstStepId });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});


