/**
 * Smoke test: create + process a single automation run.
 *
 * Notes:
 * - This script auto-loads `.env.local` (and `.env`) so you can run it like `npm run smoke:automation`.
 * - It prefers `SUPABASE_SERVICE_ROLE_KEY` for DB inspection. If you only have `VITE_SUPABASE_ANON_KEY`,
 *   it will still try to call Edge Functions, but may skip DB queries due to RLS.
 *
 * Usage (typical):
 *   AUTOMATION_ID=<id> CONTACT_ID=<id> npm run smoke:automation
 *
 * Usage (full explicit):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... WORKSPACE_ID=default \
 *   AUTOMATION_ID=<id> CONTACT_ID=<id> \
 *   node scripts/smoke-automation.mjs
 */

import fs from "node:fs";
import path from "node:path";

function loadEnvFile(p) {
  try {
    const abs = path.resolve(process.cwd(), p);
    if (!fs.existsSync(abs)) return;
    const raw = fs.readFileSync(abs, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) return;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      // strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    });
  } catch {
    // ignore
  }
}

// Load Vite-style envs for local dev
loadEnvFile(".env.local");
loadEnvFile(".env");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const WORKSPACE_ID = (process.env.WORKSPACE_ID || process.env.VITE_WORKSPACE_ID || "default").trim() || "default";
const AUTOMATION_ID = (process.env.AUTOMATION_ID || "").trim();
const CONTACT_ID = (process.env.CONTACT_ID || "").trim();
const RUNNER_TOKEN = (process.env.FLOWMAIL_RUNNER_TOKEN || "").trim();

function must(name, value) {
  if (!value) {
    console.error(`Missing env var ${name}`);
    process.exit(1);
  }
}

must("SUPABASE_URL", SUPABASE_URL);
// Prefer service role for full DB inspection, but allow anon for just calling functions.
must("SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY)", SERVICE_KEY || ANON_KEY);
must("AUTOMATION_ID", AUTOMATION_ID);
must("CONTACT_ID", CONTACT_ID);

const AUTH_KEY = SERVICE_KEY || ANON_KEY;

async function callEdgeFunction(name, body) {
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: AUTH_KEY,
      Authorization: `Bearer ${AUTH_KEY}`,
      ...(RUNNER_TOKEN ? { "x-flowmail-runner-token": RUNNER_TOKEN } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Edge Function ${name} failed (${res.status}): ${text}`);
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

async function dbGet(path) {
  if (!SERVICE_KEY) {
    // Without service role, these DB reads will generally be blocked by RLS.
    return null;
  }
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
    method: "GET",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DB GET failed (${res.status}): ${text}`);
  return text ? JSON.parse(text) : null;
}

console.log("1) Creating run via automation-trigger...");
const triggerRes = await callEdgeFunction("automation-trigger", {
  workspaceId: WORKSPACE_ID,
  automationId: AUTOMATION_ID,
  contactId: CONTACT_ID,
});
console.log(triggerRes);

console.log("\n2) Processing queue via automation-worker...");
const workerRes = await callEdgeFunction("automation-worker", { workspaceId: WORKSPACE_ID, batch: 25 });
console.log(workerRes);

const runId = triggerRes?.runId;
if (!runId) process.exit(0);

console.log("\n3) Loading run + queue state from DB...");
const runRows = await dbGet(
  `automation_runs?select=id,status,current_step_id,started_at,finished_at,last_error&workspace_id=eq.${encodeURIComponent(WORKSPACE_ID)}&id=eq.${encodeURIComponent(runId)}&limit=1`,
);
const queueRows = await dbGet(
  `automation_queue?select=id,status,step_id,execute_at,last_error&workspace_id=eq.${encodeURIComponent(WORKSPACE_ID)}&run_id=eq.${encodeURIComponent(runId)}&order=execute_at.asc&limit=50`,
);

if (!SERVICE_KEY) {
  console.log("Skipped DB inspection because SUPABASE_SERVICE_ROLE_KEY is not set (RLS would block reads).");
  console.log("If you want the script to print run/queue rows, set SUPABASE_SERVICE_ROLE_KEY in your local env.");
  process.exit(0);
}

console.log("\nRun:");
console.log(runRows?.[0] ?? null);
console.log("\nQueue items:");
console.log(queueRows ?? []);


