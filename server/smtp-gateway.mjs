import express from 'express';
import nodemailer from 'nodemailer';

const app = express();
app.use(express.json({ limit: '2mb' }));

const token = process.env.MAIL_GATEWAY_TOKEN || '';
const port = Number(process.env.PORT || 8787);

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

  // Google SMTP Relay often uses IP allowlist and may not require auth.
  const auth = user && pass ? { user, pass } : undefined;

  if (!host) throw new Error('SMTP_HOST not set');
  return nodemailer.createTransport({ host, port, secure, auth });
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/send', requireAuth, async (req, res) => {
  try {
    const { to, subject, html, text, headers } = req.body || {};
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;
    if (!from) return res.status(500).json({ error: 'SMTP_FROM not set' });
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

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[smtp-gateway] listening on :${port}`);
});


