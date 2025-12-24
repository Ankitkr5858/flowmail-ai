// Supabase Edge Function: campaign-scheduler
//
// Schedules and (A/B) tests campaigns using:
// - public.campaign_schedules
// - public.campaign_ab_state
// - public.email_sends queue (executed by email-send-worker)
//
// Modes:
// - best_time: queue emails at each contact's best_send_hour/minute within a window
// - fixed_time: queue emails at window_start time in schedule timezone (simple)
//
// Deploy:
//   supabase functions deploy campaign-scheduler
//
// Secrets:
//   SUPABASE_SERVICE_ROLE_KEY=...

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

function normalize(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}

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

  const check = (c: any) => {
    const field = String(c.field ?? '');
    const op = String(c.op ?? '');
    const value = c.value;
    if (field === 'lifecycleStage') return stage === normalize(value);
    if (field === 'temperature') return temp === normalize(value);
    if (field === 'tag') return tags.some((t) => t === normalize(value) || t.includes(normalize(value)));
    if (field === 'list') return lists.some((t) => t === normalize(value) || t.includes(normalize(value)));
    if (field === 'leadScore') {
      const v = Number(value ?? 0);
      if (op === '>=') return leadScore >= v;
      if (op === '<=') return leadScore <= v;
      if (op === '>') return leadScore > v;
      if (op === '<') return leadScore < v;
    }
    return true;
  };

  return logic === "AND" ? conds.every(check) : conds.some(check);
}

function parseHHMM(hhmm: string, fallbackH = 9, fallbackM = 0): { h: number; m: number } {
  const [h, m] = String(hhmm ?? "").split(":").map((x) => Number(x));
  return {
    h: Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : fallbackH,
    m: Number.isFinite(m) ? Math.max(0, Math.min(59, m)) : fallbackM,
  };
}

function toContactExecuteAt(now: Date, contact: any, schedule: any): string {
  const mode = String(schedule.mode ?? "best_time");
  const tz = String(contact.timezone ?? schedule.timezone ?? "UTC");

  const winStart = parseHHMM(String(schedule.window_start ?? "09:00"), 9, 0);
  const winEnd = parseHHMM(String(schedule.window_end ?? "17:00"), 17, 0);
  const bestH = Number.isFinite(Number(contact.best_send_hour)) ? Number(contact.best_send_hour) : winStart.h;
  const bestM = Number.isFinite(Number(contact.best_send_minute)) ? Number(contact.best_send_minute) : winStart.m;

  const target = mode === "best_time" ? { h: bestH, m: bestM } : winStart;

  // We keep it simple: schedule at "today" (UTC) at target time. (Timezone refinement can be added next.)
  const d = new Date(now);
  d.setUTCHours(target.h, target.m, 0, 0);
  if (d < now) d.setUTCDate(d.getUTCDate() + 1);
  // Enforce window (basic): if outside window, push to window_start tomorrow
  const tMin = target.h * 60 + target.m;
  const wS = winStart.h * 60 + winStart.m;
  const wE = winEnd.h * 60 + winEnd.m;
  if (tMin < wS || tMin > wE) {
    d.setUTCHours(winStart.h, winStart.m, 0, 0);
    if (d < now) d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString();
}

function pickVariant(subjects: string[], idx: number): { variant: string; subject: string } {
  const keys = ["A", "B", "C"];
  const k = keys[Math.min(keys.length - 1, idx)];
  return { variant: k, subject: subjects[idx] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const workspaceId = String(body?.workspaceId ?? "default") || "default";
    const limitSchedules = Math.max(1, Math.min(10, Number(body?.limitSchedules ?? 2)));
    const limitRecipients = Math.max(1, Math.min(1000, Number(body?.limitRecipients ?? 300)));
    const now = new Date();

    const schedules = await dbFetch(
      `campaign_schedules?select=id,campaign_id,status,mode,window_start,window_end,timezone,next_run_at,ab_enabled,ab_subject_a,ab_subject_b,ab_subject_c,ab_test_fraction,ab_wait_minutes,ab_metric,segment_json&workspace_id=eq.${encodeURIComponent(workspaceId)}&status=eq.active&next_run_at=lte.${encodeURIComponent(now.toISOString())}&order=next_run_at.asc&limit=${limitSchedules}`,
      { method: "GET" },
    );
    const due = Array.isArray(schedules) ? schedules : [];
    if (due.length === 0) return json({ ok: true, processed: 0 });

    let processed = 0;
    for (const s of due) {
      const scheduleId = String(s.id);
      const campaignId = String(s.campaign_id);
      const segment = s.segment_json ?? null;

      // Load campaign
      const campRows = await dbFetch(
        `campaigns?select=id,name,subject,body&workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(campaignId)}&limit=1`,
        { method: "GET" },
      );
      const campaign = Array.isArray(campRows) ? campRows[0] : null;
      if (!campaign) continue;

      // Load recipients
      const contacts = await dbFetch(
        `contacts?select=id,email,first_name,last_name,status,unsubscribed,bounced,spam_complaint,timezone,lifecycle_stage,temperature,tags,lists,lead_score,best_send_hour,best_send_minute&workspace_id=eq.${encodeURIComponent(workspaceId)}&status=eq.Subscribed&unsubscribed=is.false&bounced=is.false&spam_complaint=is.false&limit=${limitRecipients}`,
        { method: "GET" },
      );
      const eligible = (Array.isArray(contacts) ? contacts : []).filter((c: any) => evalSegment(c, segment));

      const baseSubject = String(campaign.subject ?? campaign.name ?? "Campaign").trim();
      const subjects = [
        String(s.ab_subject_a ?? "").trim(),
        String(s.ab_subject_b ?? "").trim(),
        String(s.ab_subject_c ?? "").trim(),
      ].filter(Boolean);

      const abEnabled = Boolean(s.ab_enabled) && subjects.length >= 2;
      const testFrac = Math.max(0.05, Math.min(0.3, Number(s.ab_test_fraction ?? 0.1)));
      const testCount = abEnabled ? Math.max(1, Math.floor(eligible.length * testFrac)) : 0;

      // Create/ensure AB state
      if (abEnabled) {
        const stateRows = await dbFetch(
          `campaign_ab_state?select=schedule_id,status,test_end_at,winner_subject&workspace_id=eq.${encodeURIComponent(workspaceId)}&schedule_id=eq.${encodeURIComponent(scheduleId)}&limit=1`,
          { method: "GET" },
        );
        const st = Array.isArray(stateRows) ? stateRows[0] : null;
        if (!st) {
          const end = new Date(now.getTime() + Number(s.ab_wait_minutes ?? 120) * 60 * 1000).toISOString();
          await dbFetch("campaign_ab_state", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify([{
              workspace_id: workspaceId,
              schedule_id: scheduleId,
              status: "testing",
              test_end_at: end,
            }]),
          });
        }
      }

      // Queue test sends (round-robin across variants)
      const toTest = abEnabled ? eligible.slice(0, testCount) : [];
      const toRest = abEnabled ? eligible.slice(testCount) : eligible;

      if (abEnabled && toTest.length > 0) {
        const inserts: any[] = [];
        for (let i = 0; i < toTest.length; i++) {
          const c = toTest[i];
          const { variant, subject } = pickVariant(subjects, i % subjects.length);
          inserts.push({
            workspace_id: workspaceId,
            campaign_id: campaignId,
            contact_id: c.id,
            to_email: c.email,
            subject,
            status: "queued",
            execute_at: toContactExecuteAt(now, c, s),
            schedule_id: scheduleId,
            ab_variant: variant,
            is_test: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        // upsert via unique index schedule_id+to_email
        await dbFetch("email_sends?on_conflict=workspace_id,schedule_id,to_email", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(inserts),
        });
      }

      // If AB testing is over, select winner and queue remaining
      if (abEnabled) {
        const stateRows = await dbFetch(
          `campaign_ab_state?select=schedule_id,status,test_end_at,winner_subject&workspace_id=eq.${encodeURIComponent(workspaceId)}&schedule_id=eq.${encodeURIComponent(scheduleId)}&limit=1`,
          { method: "GET" },
        );
        const st = Array.isArray(stateRows) ? stateRows[0] : null;
        if (st && st.status === "testing" && new Date(String(st.test_end_at)) <= now) {
          const metric = String(s.ab_metric ?? "opens");
          // Count opens/clicks by variant from email_sends in this schedule
          const sendRows = await dbFetch(
            `email_sends?select=ab_variant,opened_at,clicked_at,is_test&workspace_id=eq.${encodeURIComponent(workspaceId)}&schedule_id=eq.${encodeURIComponent(scheduleId)}&is_test=is.true&limit=1000`,
            { method: "GET" },
          );
          const sends = Array.isArray(sendRows) ? sendRows : [];
          const score = new Map<string, number>();
          for (const r of sends) {
            const v = String(r.ab_variant ?? "");
            if (!v) continue;
            const ok = metric === "clicks" ? Boolean(r.clicked_at) : Boolean(r.opened_at);
            if (!ok) continue;
            score.set(v, (score.get(v) ?? 0) + 1);
          }
          // Choose max; tie -> A
          const variants = ["A", "B", "C"];
          let bestV = "A";
          let bestS = -1;
          for (const v of variants) {
            const sc = score.get(v) ?? 0;
            if (sc > bestS) { bestS = sc; bestV = v; }
          }
          const winnerSubject =
            bestV === "A" ? subjects[0] :
            bestV === "B" ? subjects[1] :
            subjects[2] ?? subjects[0];

          await dbFetch(`campaign_ab_state?workspace_id=eq.${encodeURIComponent(workspaceId)}&schedule_id=eq.${encodeURIComponent(scheduleId)}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ status: "winner_selected", winner_subject: winnerSubject, updated_at: new Date().toISOString() }),
          });

          // Queue remaining with winner
          const inserts: any[] = [];
          for (const c of toRest) {
            inserts.push({
              workspace_id: workspaceId,
              campaign_id: campaignId,
              contact_id: c.id,
              to_email: c.email,
              subject: winnerSubject || baseSubject,
              status: "queued",
              execute_at: toContactExecuteAt(now, c, s),
              schedule_id: scheduleId,
              ab_variant: bestV,
              is_test: false,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
          await dbFetch("email_sends?on_conflict=workspace_id,schedule_id,to_email", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify(inserts),
          });

          // Mark schedule as completed (one-shot)
          await dbFetch(`campaign_schedules?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(scheduleId)}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ status: "completed", updated_at: new Date().toISOString() }),
          });
        }
      } else {
        // No AB: queue all and complete schedule
        const inserts: any[] = [];
        for (const c of eligible) {
          inserts.push({
            workspace_id: workspaceId,
            campaign_id: campaignId,
            contact_id: c.id,
            to_email: c.email,
            subject: baseSubject,
            status: "queued",
            execute_at: toContactExecuteAt(now, c, s),
            schedule_id: scheduleId,
            ab_variant: null,
            is_test: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        await dbFetch("email_sends?on_conflict=workspace_id,schedule_id,to_email", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(inserts),
        });
        await dbFetch(`campaign_schedules?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(scheduleId)}`, {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "completed", updated_at: new Date().toISOString() }),
        });
      }

      processed++;
    }

    return json({ ok: true, processed });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});


