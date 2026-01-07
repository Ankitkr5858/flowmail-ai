// Supabase Edge Function: automation-worker
//
// Processes due items from automation_queue and executes basic steps:
// - wait: schedules next step
// - action.send_email: enqueues an email_sends row (delivery is done by email-send-worker via SMTP gateway)
// - condition.lead_score: routes yes/no based on contact.lead_score
//
// Deploy:
//   supabase functions deploy automation-worker
//
// Secrets:
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
// (No SMTP secrets here; delivery is handled by email-send-worker)
//
// Trigger:
// - Use Supabase Scheduled Triggers (cron) to hit this endpoint periodically, or run manually.

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

function functionsBaseUrl(): string {
  const explicit = (Deno.env.get("PUBLIC_FUNCTIONS_BASE_URL") ?? "").trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const sbUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim().replace(/\/$/, "");
  return sbUrl ? `${sbUrl}/functions/v1` : "";
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

async function makeUnsubUrl(workspaceId: string, contactId: string): Promise<string | null> {
  const secret = Deno.env.get("UNSUBSCRIBE_SIGNING_KEY") ?? "";
  const base = functionsBaseUrl();
  if (!secret || !base) return null;

  const payload = { ws: workspaceId, contactId, exp: Date.now() + 1000 * 60 * 60 * 24 * 365 };
  const enc = new TextEncoder();
  const payloadB64 = (() => {
    let bin = '';
    const bytes = enc.encode(JSON.stringify(payload));
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    const b64 = btoa(bin);
    return b64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  })();

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  const sigB64 = (() => {
    let bin = '';
    new Uint8Array(sig).forEach((b) => (bin += String.fromCharCode(b)));
    const b64 = btoa(bin);
    return b64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  })();

  const token = `${payloadB64}.${sigB64}`;
  return `${base.replace(/\/$/, "")}/unsubscribe?token=${encodeURIComponent(token)}`;
}

function escapeHtml(s: string) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSimpleEmail(body: string, vars: Record<string, string>) {
  let out = body ?? "";
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return `<div style="font-family: Inter, Arial, sans-serif; font-size: 14px; line-height: 1.55; color: #0f172a; white-space: pre-wrap;">${escapeHtml(out)}</div>`;
}

function findStep(steps: any[], id: string) {
  return Array.isArray(steps) ? steps.find((s) => String(s?.id) === String(id)) : null;
}

function getNextId(step: any): string | null {
  const n = step?.config?.next;
  return typeof n === "string" && n.length > 0 ? n : null;
}

function getNextAfter(step: any, steps: any[]): string | null {
  // Primary: explicit link
  const direct = getNextId(step);
  if (direct) return direct;
  // Fallback: treat the steps array ordering as the default flow
  const idx = Array.isArray(steps) ? steps.findIndex((s) => String(s?.id) === String(step?.id)) : -1;
  if (idx >= 0 && idx + 1 < steps.length) return String(steps[idx + 1]?.id ?? "") || null;
  return null;
}

function getYesNo(step: any): { yes: string | null; no: string | null } {
  const y = step?.config?.nextYes;
  const n = step?.config?.nextNo;
  return {
    yes: typeof y === "string" && y.length > 0 ? y : null,
    no: typeof n === "string" && n.length > 0 ? n : null,
  };
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.floor(days)));
  return d.toISOString();
}

function norm(s: unknown) {
  return String(s ?? "").trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = requireRunnerToken(req);
  if (auth) return auth;

  try {
    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body?.workspaceId ?? "default") || "default";
    const batch = Math.max(1, Math.min(25, Number(body?.batch ?? 10)));

    const now = new Date().toISOString();
    const queued = await dbFetch(
      `automation_queue?select=id,run_id,automation_id,contact_id,step_id,attempts&workspace_id=eq.${encodeURIComponent(workspaceId)}&status=eq.queued&execute_at=lte.${encodeURIComponent(now)}&order=execute_at.asc&limit=${batch}`,
      { method: "GET" },
    );
    const items = Array.isArray(queued) ? queued : [];
    if (items.length === 0) return json({ ok: true, processed: 0 });

    let processed = 0;
    for (const it of items) {
      const qid = String(it.id);
      const runId = String(it.run_id);
      const automationId = String(it.automation_id);
      const contactId = String(it.contact_id);
      const stepId = String(it.step_id);

      // mark processing
      await dbFetch(`automation_queue?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(qid)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "processing", updated_at: new Date().toISOString(), attempts: Number(it.attempts ?? 0) + 1 }),
      });

      try {
        const autoRows = await dbFetch(
          `automations?select=id,steps&workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(automationId)}&limit=1`,
          { method: "GET" },
        );
        const automation = Array.isArray(autoRows) ? autoRows[0] : null;
        if (!automation) throw new Error("Automation not found");

        const steps = automation.steps ?? [];
        const step = findStep(steps, stepId);
        if (!step) throw new Error("Step not found");

        // Load contact for conditions + send
        const contactRows = await dbFetch(
          `contacts?select=id,email,first_name,last_name,lead_score,lifecycle_stage,temperature,tags,lists,last_open_date,timezone&workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(contactId)}&limit=1`,
          { method: "GET" },
        );
        const contact = Array.isArray(contactRows) ? contactRows[0] : null;
        const email = String(contact?.email ?? "").trim();
        const firstName = String(contact?.first_name ?? "").trim();
        const lastName = String(contact?.last_name ?? "").trim();
        const leadScore = Number(contact?.lead_score ?? 0);
        const lifecycleStage = norm(contact?.lifecycle_stage ?? "");
        const tags: string[] = Array.isArray(contact?.tags) ? contact.tags.map((t: any) => String(t)) : [];
        const lists: string[] = Array.isArray(contact?.lists) ? contact.lists.map((t: any) => String(t)) : [];
        const lastOpen = contact?.last_open_date ? new Date(String(contact.last_open_date)) : null;

        const kind = String(step?.config?.kind ?? "");
        let nextStepId: string | null = null;

        if (step.type === "wait" || kind === "wait") {
          const days = Number(step?.config?.days ?? 1);
          const next = getNextAfter(step, steps);
          nextStepId = next;
          if (next) {
            await dbFetch("automation_queue", {
              method: "POST",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify([{
                workspace_id: workspaceId,
                run_id: runId,
                automation_id: automationId,
                contact_id: contactId,
                step_id: next,
                execute_at: addDays(new Date().toISOString(), days),
                status: "queued",
              }]),
            });
          }
        } else if (step.type === "condition" && kind === "condition.lead_score") {
          const op = String(step?.config?.op ?? ">");
          const value = Number(step?.config?.value ?? 50);
          const { yes, no } = getYesNo(step);
          const pass =
            op === ">" ? leadScore > value :
            op === ">=" ? leadScore >= value :
            op === "<" ? leadScore < value :
            op === "<=" ? leadScore <= value :
            leadScore > value;
          const next = pass ? (yes ?? "") : (no ?? "");
          nextStepId = next || null;
          if (next) {
            await dbFetch("automation_queue", {
              method: "POST",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify([{
                workspace_id: workspaceId,
                run_id: runId,
                automation_id: automationId,
                contact_id: contactId,
                step_id: next,
                execute_at: new Date().toISOString(),
                status: "queued",
              }]),
            });
          }
        } else if (step.type === "condition" && kind === "condition.lifecycle_stage") {
          const expected = norm(step?.config?.value ?? "lead");
          const { yes, no } = getYesNo(step);
          const next = (lifecycleStage === expected) ? (yes ?? "") : (no ?? "");
          nextStepId = next || null;
          if (next) {
            await dbFetch("automation_queue", {
              method: "POST",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify([{
                workspace_id: workspaceId,
                run_id: runId,
                automation_id: automationId,
                contact_id: contactId,
                step_id: next,
                execute_at: new Date().toISOString(),
                status: "queued",
              }]),
            });
          }
        } else if (step.type === "condition" && kind === "condition.last_open_days") {
          const days = Number(step?.config?.days ?? 30);
          const { yes, no } = getYesNo(step);
          const diffDays = lastOpen ? Math.floor((Date.now() - lastOpen.getTime()) / (1000 * 60 * 60 * 24)) : 999999;
          const pass = diffDays >= days; // "has not opened in N days"
          const next = pass ? (yes ?? "") : (no ?? "");
          nextStepId = next || null;
          if (next) {
            await dbFetch("automation_queue", {
              method: "POST",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify([{
                workspace_id: workspaceId,
                run_id: runId,
                automation_id: automationId,
                contact_id: contactId,
                step_id: next,
                execute_at: new Date().toISOString(),
                status: "queued",
              }]),
            });
          }
        } else if (step.type === "condition" && kind === "condition.has_tag") {
          const want = norm(step?.config?.tag ?? "");
          const { yes, no } = getYesNo(step);
          const pass = !want ? true : tags.some((t) => norm(t) === want || norm(t).includes(want));
          const next = pass ? (yes ?? "") : (no ?? "");
          nextStepId = next || null;
          if (next) {
            await dbFetch("automation_queue", {
              method: "POST",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify([{
                workspace_id: workspaceId,
                run_id: runId,
                automation_id: automationId,
                contact_id: contactId,
                step_id: next,
                execute_at: new Date().toISOString(),
                status: "queued",
              }]),
            });
          }
        } else if (step.type === "action" && kind === "action.send_email") {
          const subject = String(step?.config?.subject ?? "Hello").trim();
          const bodyText = String(step?.config?.body ?? "").trim();
          if (email) {
            const nowIso = new Date().toISOString();
            await dbFetch("email_sends", {
              method: "POST",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify([{
                workspace_id: workspaceId,
                campaign_id: automationId, // link to automation for reporting
                contact_id: contactId,
                to_email: email,
                subject,
                status: "queued",
                execute_at: nowIso,
                created_at: nowIso,
                updated_at: nowIso,
                meta: { source: "automation", automation_id: automationId, step_id: stepId, body: bodyText },
              }]),
            });
            await dbFetch("contact_events", {
              method: "POST",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify([{
                workspace_id: workspaceId,
                contact_id: contactId,
                event_type: "email_queued",
                title: `Automation Email Queued: "${subject}"`,
                occurred_at: nowIso,
                meta: { automation_id: automationId, step_id: stepId },
              }]),
            });
          }

          const next = getNextAfter(step, steps);
          nextStepId = next;
          if (next) {
            await dbFetch("automation_queue", {
              method: "POST",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify([{
                workspace_id: workspaceId,
                run_id: runId,
                automation_id: automationId,
                contact_id: contactId,
                step_id: next,
                execute_at: new Date().toISOString(),
                status: "queued",
              }]),
            });
          }
        } else if (step.type === "action" && kind === "action.update_field") {
          // Generic field update
          const field = String(step?.config?.field ?? "").trim();
          const op = String(step?.config?.op ?? "set").trim(); // set|add|remove
          const value = step?.config?.value;

          // fetch current contact row for tags/lists
          const contactRows2 = await dbFetch(
            `contacts?select=id,tags,lists,lifecycle_stage,temperature,lead_score,status&workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(contactId)}&limit=1`,
            { method: "GET" },
          );
          const c2 = Array.isArray(contactRows2) ? contactRows2[0] : null;

          const patch: any = { updated_at: new Date().toISOString() };
          if (field === "lifecycleStage") patch.lifecycle_stage = String(value ?? "");
          else if (field === "temperature") patch.temperature = String(value ?? "");
          else if (field === "status") patch.status = String(value ?? "");
          else if (field === "leadScore") patch.lead_score = Number(value ?? 0);
          else if (field === "tag") {
            const cur: string[] = Array.isArray(c2?.tags) ? c2.tags : [];
            const v = String(value ?? "").trim();
            if (v) {
              const ncur = op === "remove"
                ? cur.filter((t) => norm(t) !== norm(v))
                : Array.from(new Set([...cur, v]));
              patch.tags = ncur;
            }
          } else if (field === "list") {
            const cur: string[] = Array.isArray(c2?.lists) ? c2.lists : [];
            const v = String(value ?? "").trim();
            if (v) {
              const ncur = op === "remove"
                ? cur.filter((t) => norm(t) !== norm(v))
                : Array.from(new Set([...cur, v]));
              patch.lists = ncur;
            }
          }

          await dbFetch(`contacts?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(contactId)}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(patch),
          });

          await dbFetch("contact_events", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify([{
              workspace_id: workspaceId,
              contact_id: contactId,
              event_type: "automation_update_field",
              title: `Automation updated ${field}`,
              occurred_at: new Date().toISOString(),
              meta: { automation_id: automationId, step_id: stepId, field, op, value: value ?? null },
            }]),
          });

          const next = getNextAfter(step, steps);
          nextStepId = next;
          if (next) {
            await dbFetch("automation_queue", {
              method: "POST",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify([{
                workspace_id: workspaceId,
                run_id: runId,
                automation_id: automationId,
                contact_id: contactId,
                step_id: next,
                execute_at: new Date().toISOString(),
                status: "queued",
              }]),
            });
          }
        } else if (step.type === "action" && kind === "action.notify") {
          const fallbackTo = Deno.env.get("TEAM_NOTIFY_EMAIL") ?? "";
          const toEmail = String(step?.config?.toEmail ?? step?.config?.to ?? fallbackTo).trim();
          const subject = String(step?.config?.subject ?? `Automation Alert: ${automationId}`).trim();
          const bodyText = String(step?.config?.body ?? `Contact ${email || contactId} reached step "${step?.title ?? stepId}"`).trim();
          if (toEmail) {
            const nowIso = new Date().toISOString();
            await dbFetch("email_sends", {
              method: "POST",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify([{
                workspace_id: workspaceId,
                campaign_id: automationId,
                contact_id: contactId,
                to_email: toEmail,
                subject,
                status: "queued",
                execute_at: nowIso,
                created_at: nowIso,
                updated_at: nowIso,
                meta: { source: "automation_notify", automation_id: automationId, step_id: stepId, body: bodyText },
              }]),
            });
          }

          const next = getNextAfter(step, steps);
          nextStepId = next;
          if (next) {
            await dbFetch("automation_queue", {
              method: "POST",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify([{
                workspace_id: workspaceId,
                run_id: runId,
                automation_id: automationId,
                contact_id: contactId,
                step_id: next,
                execute_at: new Date().toISOString(),
                status: "queued",
              }]),
            });
          }
        }

        // mark done
        await dbFetch(`automation_queue?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(qid)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "done", updated_at: new Date().toISOString() }),
        });

        // Update run progression:
        // - if we queued/scheduled a next step, set current_step_id to that step (next to execute)
        // - otherwise mark run completed.
        if (!nextStepId) {
          await dbFetch(`automation_runs?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(runId)}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ status: "completed", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
          });
        } else {
          await dbFetch(`automation_runs?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(runId)}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ current_step_id: nextStepId, updated_at: new Date().toISOString() }),
          });
        }

        processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await dbFetch(`automation_queue?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(qid)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "failed", last_error: msg, updated_at: new Date().toISOString() }),
        });
        // mark run failed too (best-effort)
        try {
          await dbFetch(`automation_runs?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(runId)}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ status: "failed", last_error: msg, updated_at: new Date().toISOString() }),
          });
        } catch {
          // ignore
        }
      }
    }

    return json({ ok: true, processed });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});


