import express from 'express';
import nodemailer from 'nodemailer';

const app = express();
app.use(express.json({ limit: '2mb' }));

const token = process.env.MAIL_GATEWAY_TOKEN || '';
const port = Number(process.env.PORT || 8787);
// Some panels/process managers accidentally inject quoted env values like `"127.0.0.1"`.
// Strip quotes to avoid Node trying to DNS-resolve a hostname like `"0.0.0.0"`.
const bindHost = String(process.env.BIND_HOST || '0.0.0.0').replace(/"/g, '').trim();

function requireAuth(req, res, next) {
  const got = String(req.headers.authorization || '');
  const expected = token ? `Bearer ${token}` : '';
  if (!token) return res.status(500).json({ error: 'MAIL_GATEWAY_TOKEN not set' });
  if (got !== expected) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function envBool(v, fallback = false) {
  if (typeof v !== 'string') return fallback;
  const s = v.trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return fallback;
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || '587');
  const secure = envBool(process.env.SMTP_SECURE, port === 465);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const from = process.env.SMTP_FROM || '';
  // For Google Workspace SMTP Relay, the EHLO/HELO name often must be one of your Workspace domains
  // (otherwise you may see: 550-5.7.1 Invalid credentials for relay ... must present one of your domain names).
  const ehloNameRaw = process.env.SMTP_EHLO_NAME || '';
  const ehloNameClean = String(ehloNameRaw).replace(/"/g, '').trim();
  const fromDomain = String(from).match(/@([^>\s]+)>?\s*$/)?.[1]?.trim() || '';
  const ehloName = ehloNameClean || fromDomain;

  // Google SMTP Relay often uses IP allowlist and may not require auth.
  const auth = user && pass ? { user, pass } : undefined;

  if (!host) throw new Error('SMTP_HOST not set');
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth,
    name: ehloName || undefined,
  });
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/send', requireAuth, async (req, res) => {
  try {
    const { to, subject, html, text, headers, from: fromOverride } = req.body || {};
    const envFrom = process.env.SMTP_FROM || process.env.SMTP_USER;
    if (!envFrom) return res.status(500).json({ error: 'SMTP_FROM not set' });

    // Allow caller to set a display-name, but do NOT allow changing the mailbox.
    // Example allowed: `"Peremis" <info@peremis.com>` when envFrom is `info@peremis.com` (or includes it).
    const extractEmail = (s) => {
      const str = String(s || '').trim();
      const m = str.match(/<([^>]+)>/);
      if (m?.[1]) return m[1].trim().toLowerCase();
      // raw email
      if (str.includes('@') && !str.includes(' ')) return str.toLowerCase();
      return '';
    };
    const envEmail = extractEmail(envFrom);
    const requested = String(fromOverride || '').trim();
    const requestedEmail = requested ? extractEmail(requested) : '';
    const from = requested && envEmail && requestedEmail === envEmail ? requested : envFrom;

    if (!to) return res.status(400).json({ error: 'Missing to' });
    if (!subject) return res.status(400).json({ error: 'Missing subject' });
    if (!html && !text) return res.status(400).json({ error: 'Missing html/text' });

    const transporter = createTransport();
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text,
      headers: typeof headers === 'object' && headers ? headers : undefined,
    });

    return res.json({ ok: true, messageId: info.messageId || null, accepted: info.accepted || [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: msg });
  }
});

app.listen(port, bindHost, () => {
  // eslint-disable-next-line no-console
  console.log(`[smtp-gateway] listening on ${bindHost}:${port}`);
});


