// Supabase Edge Function: automation-runner
//
// Production entrypoint for automations:
// - Finds workspaces with running automations
// - Runs scanner -> worker -> email-send-worker for each workspace
//
// Deploy:
//   supabase functions deploy automation-runner
//
// Secrets:
//   SUPABASE_SERVICE_ROLE_KEY=...
//   FLOWMAIL_RUNNER_TOKEN=... (recommended) - passed via header x-flowmail-runner-token
//
declare const Deno: any;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-flowmail-runner-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireRunnerToken(req: Request): Response | null {
  const required = (Deno.env.get("FLOWMAIL_RUNNER_TOKEN") ?? "").trim();
  if (!required) return null; // not enforced
  const got = String(req.headers.get("x-flowmail-runner-token") ?? "").trim();
  if (!got || got !== required) return json({ error: "Unauthorized" }, 401);
  return null;
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

async function callFn(name: string, tokenHeader: string | null, body: any) {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: service,
    Authorization: `Bearer ${service}`,
  };
  if (tokenHeader) headers["x-flowmail-runner-token"] = tokenHeader;
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Function ${name} failed (${res.status}): ${text}`);
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = requireRunnerToken(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const maxWorkspaces = Math.max(1, Math.min(300, Number(body?.maxWorkspaces ?? 200)));
    const scanLimit = Math.max(10, Math.min(500, Number(body?.scanLimit ?? 200)));
    const stepBatch = Math.max(1, Math.min(25, Number(body?.stepBatch ?? 25)));
    const emailBatch = Math.max(1, Math.min(25, Number(body?.emailBatch ?? 25)));
    const tokenHeader = (Deno.env.get("FLOWMAIL_RUNNER_TOKEN") ?? "").trim() || null;

    // Find workspaces with Running automations.
    const rows = await dbFetch(`automations?select=workspace_id&status=eq.Running&limit=10000`, { method: "GET" });
    const wsIdsRaw = Array.isArray(rows) ? rows.map((r: any) => String(r?.workspace_id ?? "")).filter(Boolean) : [];
    const wsIds = Array.from(new Set(wsIdsRaw)).slice(0, maxWorkspaces);

    let processedWorkspaces = 0;
    const results: Array<{ workspaceId: string; scanner?: any; worker?: any; email?: any; error?: string }> = [];
    for (const ws of wsIds) {
      try {
        // Keep lead_score/temperature fresh from recent contact_events (used by automation conditions).
        await callFn("lead-score-worker", tokenHeader, { workspaceId: ws, limit: scanLimit });
        const scanner = await callFn("automation-scanner", tokenHeader, { workspaceId: ws, limit: scanLimit });
        const worker = await callFn("automation-worker", tokenHeader, { workspaceId: ws, batch: stepBatch });
        const email = await callFn("email-send-worker", tokenHeader, { workspaceId: ws, batch: emailBatch });
        results.push({ workspaceId: ws, scanner, worker, email });
        processedWorkspaces++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ workspaceId: ws, error: msg });
      }
    }

    return json({ ok: true, workspaces: processedWorkspaces, totalCandidates: wsIds.length, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});


