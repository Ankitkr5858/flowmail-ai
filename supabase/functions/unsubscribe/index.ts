// Supabase Edge Function: unsubscribe (GET)
//
// Handles unsubscribe links from emails.
// Token is signed with HMAC SHA-256 using UNSUBSCRIBE_SIGNING_KEY.
//
// Deploy:
//   supabase functions deploy unsubscribe
//
// Secrets:
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
//   supabase secrets set UNSUBSCRIBE_SIGNING_KEY=...   (random string)

declare const Deno: any;

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = (s + pad).replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = btoa(bin);
  return b64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function hmacSign(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return bytesToBase64Url(new Uint8Array(sig));
}

async function hmacVerify(secret: string, payload: string, signature: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sigBytes = base64UrlToBytes(signature);
  const sigBuf = sigBytes.buffer.slice(sigBytes.byteOffset, sigBytes.byteOffset + sigBytes.byteLength) as ArrayBuffer;
  return crypto.subtle.verify("HMAC", key, sigBuf, enc.encode(payload));
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

Deno.serve(async (req: Request) => {
  try {
    const u = new URL(req.url);
    const token = u.searchParams.get("token") ?? "";
    if (!token) return html("<h2>Invalid link</h2>", 400);

    const [payloadB64, sig] = token.split(".");
    if (!payloadB64 || !sig) return html("<h2>Invalid link</h2>", 400);

    const payloadJson = new TextDecoder().decode(base64UrlToBytes(payloadB64));
    const secret = Deno.env.get("UNSUBSCRIBE_SIGNING_KEY") ?? "";
    if (!secret) return html("<h2>Server not configured</h2>", 500);

    const ok = await hmacVerify(secret, payloadB64, sig);
    if (!ok) return html("<h2>Invalid link</h2>", 400);

    const payload = JSON.parse(payloadJson);
    const workspaceId = String(payload?.ws ?? "default") || "default";
    const contactId = String(payload?.contactId ?? "").trim();
    const exp = Number(payload?.exp ?? 0);
    if (!contactId) return html("<h2>Invalid link</h2>", 400);
    if (exp && Date.now() > exp) return html("<h2>Link expired</h2>", 400);

    // Update contact (best-effort)
    await dbFetch(`contacts?workspace_id=eq.${encodeURIComponent(workspaceId)}&id=eq.${encodeURIComponent(contactId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "Unsubscribed", unsubscribed: true, updated_at: new Date().toISOString() }),
    });

    // Timeline event
    await dbFetch("contact_events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([{
        workspace_id: workspaceId,
        contact_id: contactId,
        event_type: "unsubscribed",
        title: "Unsubscribed",
        occurred_at: new Date().toISOString(),
      }]),
    });

    return html(`
      <div style="font-family: Inter, Arial, sans-serif; padding: 24px;">
        <h2>You're unsubscribed</h2>
        <p>You won't receive future newsletters.</p>
      </div>
    `);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return html(`<h2>Error</h2><pre>${msg}</pre>`, 500);
  }
});


