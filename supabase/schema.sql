-- FlowMail AI (Supabase) schema upgrades for Phase 1 (single-tenant).
-- Run in Supabase Dashboard → SQL Editor.
--
-- This file is migration-friendly (uses IF NOT EXISTS) so you can re-run it safely.

create extension if not exists pgcrypto;

create table if not exists public.contacts (
  workspace_id text not null default 'default',
  id text not null,
  name text not null,
  email text not null,
  status text not null,
  added_date text not null,
  tags text[] not null default '{}',
  first_name text,
  last_name text,
  phone text,
  timezone text,
  lifecycle_stage text,
  temperature text,
  lists text[] not null default '{}',
  acquisition_source text,
  last_open_date timestamptz,
  last_click_date timestamptz,
  last_purchase_date timestamptz,
  total_emails_sent integer not null default 0,
  total_opens integer not null default 0,
  total_clicks integer not null default 0,
  total_purchases integer not null default 0,
  unsubscribed boolean not null default false,
  bounced boolean not null default false,
  spam_complaint boolean not null default false,
  lead_score integer,
  company text,
  job_title text,
  location text,
  website text,
  -- Legacy: events were stored inline; keep for backward compatibility.
  events jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

-- Add columns if you created the table earlier from a previous version.
alter table public.contacts add column if not exists last_purchase_date timestamptz;
alter table public.contacts add column if not exists total_emails_sent integer not null default 0;
alter table public.contacts add column if not exists total_opens integer not null default 0;
alter table public.contacts add column if not exists total_clicks integer not null default 0;
alter table public.contacts add column if not exists total_purchases integer not null default 0;
alter table public.contacts add column if not exists unsubscribed boolean not null default false;
alter table public.contacts add column if not exists bounced boolean not null default false;
alter table public.contacts add column if not exists spam_complaint boolean not null default false;
alter table public.contacts add column if not exists best_send_hour integer;
alter table public.contacts add column if not exists best_send_minute integer;
alter table public.contacts add column if not exists best_send_updated_at timestamptz;

-- Best-send-time cursor (Phase 4): update contacts.best_send_* based on opens incrementally
create table if not exists public.best_time_cursor (
  workspace_id text not null default 'default',
  id uuid not null default gen_random_uuid(),
  last_occurred_at timestamptz,
  last_event_id uuid,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists best_time_cursor_updated_idx on public.best_time_cursor (workspace_id, updated_at desc);

create table if not exists public.campaigns (
  workspace_id text not null default 'default',
  id text not null,
  name text not null,
  date text,
  status text not null,
  open_rate text,
  click_rate text,
  subject text,
  body text,
  topic text,
  tone text,
  sent_count integer,
  open_count integer,
  click_count integer,
  conversion_count integer,
  segment_name text,
  email_blocks jsonb,
  email_style jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create table if not exists public.automations (
  workspace_id text not null default 'default',
  id text not null,
  name text not null,
  runs text,
  status text not null,
  count integer not null default 0,
  trigger text,
  last_activity_at timestamptz,
  steps jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists contacts_email_idx on public.contacts (workspace_id, email);
create index if not exists contacts_lifecycle_idx on public.contacts (workspace_id, lifecycle_stage);
create index if not exists contacts_temperature_idx on public.contacts (workspace_id, temperature);

-- Contact events (timeline source of truth)
create table if not exists public.contact_events (
  workspace_id text not null default 'default',
  id uuid not null default gen_random_uuid(),
  contact_id text not null,
  event_type text not null,
  title text not null,
  occurred_at timestamptz not null default now(),
  meta jsonb,
  campaign_id text,
  primary key (workspace_id, id)
);

create index if not exists contact_events_contact_idx on public.contact_events (workspace_id, contact_id, occurred_at desc);

-- Email sends (per recipient) + provider events (Phase 2 tracking)
create table if not exists public.email_sends (
  workspace_id text not null default 'default',
  id uuid not null default gen_random_uuid(),
  campaign_id text not null,
  contact_id text,
  to_email text not null,
  from_email text,
  subject text,
  provider text not null default 'resend',
  provider_message_id text,
  status text not null default 'queued', -- queued|sent|delivered|bounced|complained
  execute_at timestamptz,
  schedule_id uuid,
  ab_variant text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

-- If you created email_sends earlier, add new scheduling/A-B columns safely.
alter table public.email_sends add column if not exists execute_at timestamptz;
alter table public.email_sends add column if not exists schedule_id uuid;
alter table public.email_sends add column if not exists ab_variant text;
alter table public.email_sends add column if not exists is_test boolean not null default false;

create index if not exists email_sends_campaign_idx on public.email_sends (workspace_id, campaign_id, created_at desc);
create index if not exists email_sends_contact_idx on public.email_sends (workspace_id, contact_id, created_at desc);
create index if not exists email_sends_provider_idx on public.email_sends (workspace_id, provider, provider_message_id);
create index if not exists email_sends_due_idx on public.email_sends (workspace_id, status, execute_at);

-- Prevent duplicate queued sends per schedule+recipient (null schedule_id allows duplicates; OK)
create unique index if not exists email_sends_schedule_to_uq on public.email_sends (workspace_id, schedule_id, to_email);

-- Metrics bump helper (used by /track Edge Function)
create or replace function public.bump_contact_metric(
  p_workspace_id text,
  p_contact_id text,
  p_metric text
) returns void
language plpgsql
security definer
as $$
begin
  if p_metric = 'open' then
    update public.contacts
      set total_opens = coalesce(total_opens, 0) + 1,
          last_open_date = now(),
          updated_at = now()
      where workspace_id = p_workspace_id and id = p_contact_id;
  elsif p_metric = 'click' then
    update public.contacts
      set total_clicks = coalesce(total_clicks, 0) + 1,
          last_click_date = now(),
          updated_at = now()
      where workspace_id = p_workspace_id and id = p_contact_id;
  end if;
end;
$$;

create table if not exists public.resend_events (
  workspace_id text not null default 'default',
  id uuid not null default gen_random_uuid(),
  provider_message_id text,
  event_type text not null,
  payload jsonb,
  received_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists resend_events_message_idx on public.resend_events (workspace_id, provider_message_id, received_at desc);

-- Automation execution (Phase 3)
create table if not exists public.automation_runs (
  workspace_id text not null default 'default',
  id uuid not null default gen_random_uuid(),
  automation_id text not null,
  contact_id text not null,
  status text not null default 'running', -- running|completed|failed|cancelled
  current_step_id text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  last_error text,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists automation_runs_contact_idx on public.automation_runs (workspace_id, contact_id, created_at desc);
create index if not exists automation_runs_automation_idx on public.automation_runs (workspace_id, automation_id, created_at desc);

create table if not exists public.automation_queue (
  workspace_id text not null default 'default',
  id uuid not null default gen_random_uuid(),
  run_id uuid not null,
  automation_id text not null,
  contact_id text not null,
  step_id text not null,
  execute_at timestamptz not null default now(),
  status text not null default 'queued', -- queued|processing|done|failed
  attempts integer not null default 0,
  last_error text,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists automation_queue_due_idx on public.automation_queue (workspace_id, status, execute_at);

-- Automation event cursor (Phase 3): track last processed contact_event for trigger scanning
create table if not exists public.automation_event_cursor (
  workspace_id text not null default 'default',
  id uuid not null default gen_random_uuid(),
  last_occurred_at timestamptz,
  last_event_id uuid,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists automation_event_cursor_updated_idx on public.automation_event_cursor (workspace_id, updated_at desc);

-- Lead scoring cursor (Phase 3): process contact_events incrementally to update lead_score + temperature
create table if not exists public.lead_score_cursor (
  workspace_id text not null default 'default',
  id uuid not null default gen_random_uuid(),
  last_occurred_at timestamptz,
  last_event_id uuid,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists lead_score_cursor_updated_idx on public.lead_score_cursor (workspace_id, updated_at desc);

-- Campaign scheduling + A/B testing state (Phase 4)
create table if not exists public.campaign_schedules (
  workspace_id text not null default 'default',
  id uuid not null default gen_random_uuid(),
  campaign_id text not null,
  status text not null default 'active', -- active|paused|completed
  mode text not null default 'best_time', -- best_time|fixed_time
  window_start text not null default '09:00', -- HH:MM
  window_end text not null default '17:00', -- HH:MM
  timezone text not null default 'UTC',
  send_on date, -- optional (if null => send asap)
  next_run_at timestamptz not null default now(),
  -- A/B testing (optional)
  ab_enabled boolean not null default false,
  ab_subject_a text,
  ab_subject_b text,
  ab_subject_c text,
  ab_test_fraction numeric not null default 0.1, -- 10%
  ab_wait_minutes integer not null default 120, -- pick winner after 2 hours
  ab_metric text not null default 'opens', -- opens|clicks
  segment_json jsonb,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists campaign_schedules_due_idx on public.campaign_schedules (workspace_id, status, next_run_at);

create table if not exists public.campaign_ab_state (
  workspace_id text not null default 'default',
  schedule_id uuid not null,
  status text not null default 'testing', -- testing|winner_selected|completed
  started_at timestamptz not null default now(),
  test_end_at timestamptz not null,
  winner_subject text,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, schedule_id)
);

-- Newsletter scheduling (Phase 2)
create table if not exists public.newsletter_schedules (
  workspace_id text not null default 'default',
  id uuid not null default gen_random_uuid(),
  campaign_id text not null,
  status text not null default 'active', -- active|paused
  cadence text not null, -- weekly|monthly
  day_of_week integer,  -- 0=Sun..6=Sat (weekly)
  day_of_month integer, -- 1..28 (monthly; keep <= 28 to avoid month length edge cases)
  send_time text not null default '09:00', -- HH:MM in workspace timezone (simple)
  timezone text not null default 'UTC',
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, id)
);

create index if not exists newsletter_schedules_due_idx on public.newsletter_schedules (workspace_id, status, next_run_at);

-- Store segmentation rules per schedule (Phase 1/2 bridge)
alter table public.newsletter_schedules add column if not exists name text;
alter table public.newsletter_schedules add column if not exists segment_json jsonb;

-- Unsubscribe token support (Phase 2 compliance)
-- We keep it simple: we generate a signed token and store nothing server-side.



