// Supabase Edge Function: automation-runs
//
// Lists automation runs for a workspace (optionally filtered by automationId or runId).
// Uses service role to read DB; authorizes either runner token OR an interactive signed-in user
// whose auth.uid() matches workspace_id.
//
// Deploy:
//   supabase functions deploy automation-runs
//
// Secrets:
//   SUPABASE_SERVICE_ROLE_KEY=...
//   FLOWMAIL_RUNNER_TOKEN=... (optional)
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

function bearerFrom(req: Request): string | null {
  const h = String(req.headers.get("authorization") ?? "");
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() ? m[1].trim() : null;
}

async function authUserId(req: Request): Promise<string | null> {
  const sbUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
  const service = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const jwt = bearerFrom(req);
  if (!sbUrl || !service || !jwt) return null;
  const res = await fetch(`${sbUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: service,
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!res.ok) return null;
  const u = await res.json().catch(() => null);
  const id = u?.id ? String(u.id).trim() : "";
  return id || null;
}

async function requireRunnerTokenOrWorkspaceUser(req: Request, workspaceId: string): Promise<Response | null> {
  const required = (Deno.env.get("FLOWMAIL_RUNNER_TOKEN") ?? "").trim();
  if (!required) return null; // not enforced

  const got = String(req.headers.get("x-flowmail-runner-token") ?? "").trim();
  if (got && got === required) return null;

  const uid = await authUserId(req);
  if (uid && String(workspaceId).trim() === uid) return null;

  return json({ error: "Unauthorized" }, 401);
}

async function dbFetch(path: string) {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
  const service = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !service) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method: "GET",
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DB error ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const uid = await authUserId(req);
    const workspaceId = String(body?.workspaceId ?? uid ?? "default").trim() || "default";
    const automationId = String(body?.automationId ?? "").trim();
    const runId = String(body?.runId ?? "").trim();
    const limit = Math.max(1, Math.min(200, Number(body?.limit ?? 50)));

    const auth = await requireRunnerTokenOrWorkspaceUser(req, workspaceId);
    if (auth) return auth;

    const qs: string[] = [];
    qs.push(`workspace_id=eq.${encodeURIComponent(workspaceId)}`);
    if (automationId) qs.push(`automation_id=eq.${encodeURIComponent(automationId)}`);
    if (runId) qs.push(`id=eq.${encodeURIComponent(runId)}`);
    qs.push(`order=started_at.desc`);
    qs.push(`limit=${limit}`);

    const rows = await dbFetch(
      `automation_runs?select=id,automation_id,contact_id,status,current_step_id,started_at,finished_at,last_error&${qs.join("&")}`,
    );
    return json({ ok: true, rows: Array.isArray(rows) ? rows : [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});

