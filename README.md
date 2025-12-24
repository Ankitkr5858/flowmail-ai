<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1kMscKuN2L41sC5xE52dvtRknFv_LR6Mb

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create a local env file:
   - Copy `env.example` → `.env.local`
3. Set your keys in `.env.local`:
   - `VITE_SUPABASE_URL=...`
   - `VITE_SUPABASE_ANON_KEY=...`
   - `VITE_WORKSPACE_ID=default` (optional)
4. Run the app:
   `npm run dev`

## Database (Supabase)
Run the schema in Supabase Dashboard → SQL Editor:
- `supabase/schema.sql`

## Auth (Google Sign-in)
1. Supabase Dashboard → **Authentication → Providers → Google**
   - Enable Google provider
   - Copy the **Callback URL** shown there.
2. Google Cloud Console → **APIs & Services → Credentials**
   - Create **OAuth client ID (Web application)**
   - Add **Authorized redirect URI** = the Supabase callback URL.
3. Supabase Dashboard → **Authentication → URL Configuration**
   - Site URL: `http://localhost:3000` (or your dev URL)
   - Add Redirect URL: same.

## Gemini (server-side via Edge Function)
Gemini is called from a Supabase Edge Function (not from the browser).

- Deploy:
  - `supabase functions deploy generate-email`
- Set secret:
  - `supabase secrets set GEMINI_API_KEY=...`

## Email Sending (Google SMTP Relay via SMTP Gateway)
We no longer use Resend. Supabase Edge Functions typically cannot connect to SMTP ports directly, so we send email through a small **SMTP Gateway** (Node + Nodemailer) that connects to **Google SMTP Relay**.

### 1) Run SMTP Gateway
Local:

```bash
npm run smtp-gateway
```

Required env vars for the gateway (set in your host environment):
- `MAIL_GATEWAY_TOKEN=...` (random string)
- `SMTP_HOST=smtp-relay.gmail.com` (or your relay host)
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_FROM=jimmy@peremis.com`
- Optional auth (only if your relay requires it):
  - `SMTP_USER=...`
  - `SMTP_PASS=...`

### 2) Supabase secrets (Edge Functions)
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `MAIL_GATEWAY_URL=https://<your-smtp-gateway-host>`
- `MAIL_GATEWAY_TOKEN=...` (same token as gateway)
- Optional (notify action default recipient):
  - `TEAM_NOTIFY_EMAIL=jimmy@peremis.com`

### Deploy
- `supabase functions deploy send-campaign`

### Use in UI
Go to **Campaigns** → click **Send Now** to send to up to 50 eligible contacts (Subscribed, not suppressed).

## Newsletters (weekly/monthly schedules)
We run newsletters via a scheduled Edge Function that sends a campaign on a cadence.

### 1) DB
Re-run:
- `supabase/schema.sql` (adds `newsletter_schedules`)

### 2) Deploy + secrets
Deploy:
- `supabase functions deploy newsletter-scheduler`

Secrets (Supabase → Edge Functions → Secrets):
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `RESEND_API_KEY=...`
- `RESEND_FROM="Jimmy <jimmy@peremis.com>"`
- `UNSUBSCRIBE_SIGNING_KEY=...` (random string)
- `PUBLIC_FUNCTIONS_BASE_URL=https://<your-project>.functions.supabase.co`

### 3) Create a schedule row
In Supabase SQL Editor (example: weekly on Monday 09:00 UTC):

```sql
insert into public.newsletter_schedules (
  workspace_id, campaign_id, cadence, day_of_week, send_time, timezone, next_run_at
)
values (
  'default',
  '<CAMPAIGN_ID>',
  'weekly',
  1,
  '09:00',
  'UTC',
  now()
);
```

### 4) Schedule the function (cron)
Supabase Dashboard → Scheduled Triggers:
- Call function: `newsletter-scheduler`
- Interval: every 5–15 minutes

### Unsubscribe link
The scheduler appends an unsubscribe link handled by the `unsubscribe` Edge Function.
Deploy it:
- `supabase functions deploy unsubscribe`

## Tracking (opens/clicks) without Resend
We track opens/clicks using our own endpoints:
- `GET /track/open?sid=<email_send_id>` (pixel)
- `GET /track/click?sid=<email_send_id>&url=<encoded>` (redirect)

Deploy:
- `supabase functions deploy track`

Ensure these secrets are set so emails include tracking + unsubscribe:
- `PUBLIC_FUNCTIONS_BASE_URL=https://<your-project>.functions.supabase.co`
- `UNSUBSCRIBE_SIGNING_KEY=...`

## Cron (Free plan alternative): GitHub Actions scheduler
If you don’t see “Scheduled Triggers” in Supabase (common on free plan), use GitHub Actions to call the workers.

### 1) Push workflow
This repo includes:
- `.github/workflows/supabase-cron-workers.yml`

### 2) Add GitHub repo secrets
In GitHub → **Settings → Secrets and variables → Actions** add:
- `SUPABASE_FUNCTIONS_BASE` = `https://<project-ref>.supabase.co/functions/v1`
- `SUPABASE_ANON_KEY` = your Supabase anon key

The workflow runs every 2 minutes and internally gates other workers at 5/10/15/30 minute intervals.

## Phase 4: Scheduling, Best Send Time, A/B Testing
These features use the `email_sends` queue + scheduled Edge Functions.

### DB
Re-run:
- `supabase/schema.sql`

### Deploy Edge Functions
- `supabase functions deploy email-send-worker`
- `supabase functions deploy best-time-worker`
- `supabase functions deploy campaign-scheduler`
- `supabase functions deploy suggest-segments`

### Cron (Supabase Scheduled Triggers)
Recommended intervals:
- `email-send-worker`: every 1–5 minutes
- `best-time-worker`: every 10–30 minutes
- `campaign-scheduler`: every 5–15 minutes

### Secrets
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `RESEND_API_KEY=...`
- `RESEND_FROM="Jimmy <jimmy@peremis.com>"`
