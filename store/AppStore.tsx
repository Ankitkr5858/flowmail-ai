import { useMemo, useSyncExternalStore } from 'react';
import type { Automation, Campaign, ChartData, Contact, Metric, WorkspaceSettings, ContactEvent } from '../types';
import { createSeedState } from '../services/seedData';
import { loadFromStorage, saveToStorage } from '../services/storage';
import { getSupabase, getWorkspaceId, isSupabaseConfigured } from '../services/supabase';
import { createSupabaseRepo, type SupabaseRepo } from '../services/supabaseRepo';
import { logContactEvent } from '../services/contactEvents';
import { invokeEdgeFunction } from '../services/edgeFunctions';

export type DateRangePreset = '30d' | '90d' | 'ytd';

export interface UiState {
  dateRangePreset: DateRangePreset;
  lastRefreshedAt: string; // ISO
  chartSeed: number;
}

export interface AppState {
  campaigns: Campaign[];
  contacts: Contact[];
  automations: Automation[];
  chartData: ChartData[];
  settings?: WorkspaceSettings;
  ui?: UiState;
}

type Updater = (prev: AppState) => AppState;
type Listener = () => void;

// Bump storage version to avoid showing any previously cached demo/dummy data.
const STORAGE_KEY = 'flowmail.ai.appState.v2';

function nowIso(): string {
  return new Date().toISOString();
}

function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function formatDisplayDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function uniqStrings(xs: string[] | undefined | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of (xs ?? [])) {
    const v = String(raw ?? '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function startForPreset(preset: DateRangePreset): Date {
  const now = new Date();
  if (preset === 'ytd') return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const days = preset === '90d' ? 90 : 30;
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function fmtMonth(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short' });
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

function buildBuckets(preset: DateRangePreset): Array<{ key: string; start: Date; end: Date; label: string }> {
  const now = new Date();
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);

  if (preset === 'ytd') {
    const buckets: Array<{ key: string; start: Date; end: Date; label: string }> = [];
    const start = startForPreset('ytd');
    const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cur <= end) {
      const s = new Date(cur);
      const e = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      buckets.push({ key: `${s.getUTCFullYear()}-${s.getUTCMonth()}`, start: s, end: e, label: fmtMonth(s) });
      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
    return buckets.slice(-12);
  }

  if (preset === '90d') {
    const buckets: Array<{ key: string; start: Date; end: Date; label: string }> = [];
    const start = startForPreset('90d');
    const cur = new Date(start);
    while (cur <= end) {
      const s = new Date(cur);
      const e = new Date(cur);
      e.setUTCDate(e.getUTCDate() + 6);
      e.setUTCHours(23, 59, 59, 999);
      buckets.push({ key: s.toISOString().slice(0, 10), start: s, end: e, label: fmtDay(s) });
      cur.setUTCDate(cur.getUTCDate() + 7);
    }
    return buckets;
  }

  // 30d: daily buckets
  const buckets: Array<{ key: string; start: Date; end: Date; label: string }> = [];
  const start = startForPreset('30d');
  const cur = new Date(start);
  while (cur <= end) {
    const s = new Date(cur);
    const e = new Date(cur);
    e.setUTCHours(23, 59, 59, 999);
    buckets.push({ key: s.toISOString().slice(0, 10), start: s, end: e, label: fmtDay(s) });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return buckets;
}

async function fetchChartDataFromSupabase(preset: DateRangePreset): Promise<ChartData[] | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return null;

  const ws = getWorkspaceId() || 'default';
  const buckets = buildBuckets(preset);
  const startIso = buckets[0]?.start.toISOString();
  const endIso = buckets[buckets.length - 1]?.end.toISOString();
  if (!startIso || !endIso) return null;

  // Pull timestamps for opens/clicks within the range (real tracking via /track function)
  const [opensRes, clicksRes] = await Promise.all([
    sb
      .from('email_sends')
      .select('opened_at')
      .eq('workspace_id', ws)
      .not('opened_at', 'is', null)
      .gte('opened_at', startIso)
      .lte('opened_at', endIso)
      .limit(10000),
    sb
      .from('email_sends')
      .select('clicked_at')
      .eq('workspace_id', ws)
      .not('clicked_at', 'is', null)
      .gte('clicked_at', startIso)
      .lte('clicked_at', endIso)
      .limit(10000),
  ]);
  if (opensRes.error) throw opensRes.error;
  if (clicksRes.error) throw clicksRes.error;

  const opens = (opensRes.data ?? []).map((r: any) => new Date(r.opened_at));
  const clicks = (clicksRes.data ?? []).map((r: any) => new Date(r.clicked_at));

  const inBucket = (d: Date, b: { start: Date; end: Date }) => d >= b.start && d <= b.end;
  return buckets.map((b) => ({
    name: b.label,
    opens: opens.filter((d) => inBucket(d, b)).length,
    clicks: clicks.filter((d) => inBucket(d, b)).length,
    conversions: 0,
  }));
}

async function refreshCampaignMetricsFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  if (!sb) return;
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return;

  const ws = getWorkspaceId() || 'default';
  const { data: rows, error } = await sb
    .from('email_sends')
    .select('campaign_id,status,opened_at,clicked_at')
    .eq('workspace_id', ws)
    .limit(10000);
  if (error) throw error;

  const byCampaign = new Map<string, { delivered: number; opens: number; clicks: number }>();
  (rows ?? []).forEach((r: any) => {
    const id = String(r?.campaign_id ?? '').trim();
    if (!id) return;
    const status = String(r?.status ?? '').toLowerCase();
    const delivered = status !== 'failed' ? 1 : 0;
    const opens = r?.opened_at ? 1 : 0;
    const clicks = r?.clicked_at ? 1 : 0;
    const cur = byCampaign.get(id) ?? { delivered: 0, opens: 0, clicks: 0 };
    cur.delivered += delivered;
    cur.opens += opens;
    cur.clicks += clicks;
    byCampaign.set(id, cur);
  });

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  setState((prev) => {
    const nextCampaigns = prev.campaigns.map((c) => {
      const stats = byCampaign.get(String(c.id)) ?? null;
      if (!stats) return c;
      const openRate = stats.delivered > 0 ? pct(stats.opens / stats.delivered) : '0.0%';
      const clickRate = stats.delivered > 0 ? pct(stats.clicks / stats.delivered) : '0.0%';
      return {
        ...c,
        sentCount: stats.delivered,
        openCount: stats.opens,
        clickCount: stats.clicks,
        openRate,
        clickRate,
      };
    });
    return { ...prev, campaigns: nextCampaigns };
  });
}

async function refreshAutomationMetricsFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  if (!sb) return;
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return;

  const ws = getWorkspaceId() || 'default';
  const { data: rows, error } = await sb
    .from('automation_runs')
    .select('automation_id,contact_id,status,started_at,finished_at,last_error')
    .eq('workspace_id', ws)
    .order('started_at', { ascending: false })
    .limit(10000);
  if (error) throw error;

  const byAutomation = new Map<string, { contacts: Set<string>; lastAt: string | null; errors: number }>();
  (rows ?? []).forEach((r: any) => {
    const aid = String(r?.automation_id ?? '').trim();
    if (!aid) return;
    const cid = String(r?.contact_id ?? '').trim();
    const st = String(r?.status ?? '').toLowerCase();
    const hasErr = Boolean(r?.last_error) || st === 'failed';
    const t = String(r?.finished_at ?? r?.started_at ?? '').trim() || null;
    const cur = byAutomation.get(aid) ?? { contacts: new Set<string>(), lastAt: null, errors: 0 };
    if (cid) cur.contacts.add(cid);
    if (t && (!cur.lastAt || new Date(t) > new Date(cur.lastAt))) cur.lastAt = t;
    if (hasErr) cur.errors += 1;
    byAutomation.set(aid, cur);
  });

  setState((prev) => {
    const nextAutos = prev.automations.map((a) => {
      const stats = byAutomation.get(String(a.id)) ?? null;
      if (!stats) return { ...a, errorCount: 0 };
      const count = stats.contacts.size;
      return {
        ...a,
        count,
        runs: `${count} contacts`,
        lastActivityAt: stats.lastAt ?? a.lastActivityAt,
        errorCount: stats.errors,
      };
    });
    return { ...prev, automations: nextAutos };
  });
}

function normalizeLoadedState(s: AppState): AppState {
  const seeded = createSeedState();
  const ui: UiState = {
    dateRangePreset: s.ui?.dateRangePreset ?? seeded.ui.dateRangePreset,
    lastRefreshedAt: s.ui?.lastRefreshedAt ?? seeded.ui.lastRefreshedAt,
    chartSeed: s.ui?.chartSeed ?? seeded.ui.chartSeed,
  };

  return {
    campaigns: Array.isArray(s.campaigns) ? s.campaigns : seeded.campaigns,
    contacts: Array.isArray(s.contacts) ? s.contacts : seeded.contacts,
    automations: Array.isArray(s.automations) ? s.automations : seeded.automations,
    chartData: Array.isArray(s.chartData) ? s.chartData : seeded.chartData,
    settings: s.settings ?? seeded.settings,
    ui,
  };
}

let _state: AppState = normalizeLoadedState(
  loadFromStorage<AppState>(STORAGE_KEY, createSeedState() as unknown as AppState)
);

const listeners = new Set<Listener>();

function getState(): AppState {
  return _state;
}

function setState(update: Updater): void {
  _state = update(_state);
  saveToStorage(STORAGE_KEY, _state);
  listeners.forEach((l) => l());
}

// ---- Supabase sync (single-tenant) ----
let supaRepo: SupabaseRepo | null = null;
let supaRepoWs: string | null = null;
let supaInitStarted = false;

// ---- Automation engine kick (best-effort, debounced) ----
let automationKickTimer: number | null = null;
let automationKickInFlight = false;
let automationKickPending = false;

function scheduleAutomationKickCurrent() {
  void resolveWorkspaceIdFromSession().then((ws) => scheduleAutomationKick(ws));
}

function scheduleAutomationKick(workspaceId: string) {
  if (!isSupabaseConfigured()) return;
  const ws = String(workspaceId || getWorkspaceId() || 'default').trim() || 'default';
  // Debounce bursts (eg: multiple tag changes).
  if (automationKickTimer) window.clearTimeout(automationKickTimer);
  automationKickTimer = window.setTimeout(() => {
    automationKickTimer = null;
    void runAutomationKick(ws);
  }, 800);
}

async function runAutomationKick(workspaceId: string) {
  if (!isSupabaseConfigured()) return;
  if (automationKickInFlight) {
    automationKickPending = true;
    return;
  }
  automationKickInFlight = true;
  try {
    const ws = String(workspaceId || getWorkspaceId() || 'default').trim() || 'default';
    // Process triggers -> queue -> steps. Email delivery is handled separately by SMTP gateway workers.
    await invokeEdgeFunction('automation-scanner', { workspaceId: ws, limit: 200 });
    await invokeEdgeFunction('automation-worker', { workspaceId: ws, batch: 25 });
  } catch (e) {
    // Keep UI resilient; missing runner tokens / not-yet-deployed functions shouldn't break primary actions.
    // eslint-disable-next-line no-console
    console.warn('[flowmail] automation kick failed:', e);
  } finally {
    automationKickInFlight = false;
    if (automationKickPending) {
      automationKickPending = false;
      // Run once more to catch anything that arrived while we were processing.
      void runAutomationKick(workspaceId);
    }
  }
}

async function resolveWorkspaceIdFromSession(): Promise<string> {
  const sb = getSupabase();
  if (!sb) return getWorkspaceId() || 'default';
  try {
    const { data } = await sb.auth.getSession();
    const uid = data.session?.user?.id;
    return (uid && String(uid).trim()) ? String(uid).trim() : (getWorkspaceId() || 'default');
  } catch {
    return getWorkspaceId() || 'default';
  }
}

async function getRepo(): Promise<SupabaseRepo | null> {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const ws = await resolveWorkspaceIdFromSession();
  if (supaRepo && supaRepoWs === ws) return supaRepo;
  supaRepoWs = ws;
  supaRepo = createSupabaseRepo(sb, ws);
  return supaRepo;
}

async function hydrateFromSupabase(): Promise<void> {
  try {
    const repo = await getRepo();
    if (!repo) return;
    const data = await repo.fetchAll();
    // Never show legacy demo records (from old seedData versions).
    const demoCampaignNames = new Set(['Summer Sale Blast', 'Product Update Newsletter', 'Welcome Series - New Users', 'Black Friday Teaser']);
    const demoAutomationNames = new Set(['Abandoned Cart Recovery', 'Post-Purchase Follow-up', 'Lead Nurturing Sequence', 'Win-back Inactive']);
    const demoContactEmails = new Set(['jane.doe@example.com', 'john.smith@example.com']);
    setState((prev) => ({
      ...prev,
      contacts: (data.contacts ?? []).filter((c) => !demoContactEmails.has(String(c.email ?? '').toLowerCase())),
      campaigns: (data.campaigns ?? []).filter((c) => !demoCampaignNames.has(String(c.name ?? ''))),
      automations: (data.automations ?? []).filter((a) => !demoAutomationNames.has(String(a.name ?? ''))),
    }));
    await refreshCampaignMetricsFromSupabase();
    await refreshAutomationMetricsFromSupabase();
    // Replace seeded chart data with real tracking data when available.
    const preset = getState().ui?.dateRangePreset ?? '30d';
    const real = await fetchChartDataFromSupabase(preset);
    if (real) {
      setState((prev) => ({
        ...prev,
        chartData: real,
        ui: { ...(prev.ui ?? createSeedState().ui), lastRefreshedAt: nowIso() },
      }));
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[flowmail] Supabase hydrate failed:', e);
  }
}

function initSupabaseSyncOnce() {
  if (supaInitStarted) return;
  supaInitStarted = true;
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  if (!sb) return;

  // Hydrate immediately if session already exists.
  sb.auth.getSession().then(({ data }) => {
    if (data.session) void hydrateFromSupabase();
  });

  // Hydrate on sign-in; clear on sign-out (keeps UI responsive with cached state).
  sb.auth.onAuthStateChange((_evt, session) => {
    if (session) void hydrateFromSupabase();
  });
}

initSupabaseSyncOnce();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export interface AppActions {
  setDateRangePreset: (preset: DateRangePreset) => void;
  refreshChartData: () => void;
  refreshAll: () => void;

  createCampaign: (patch: Partial<Campaign>) => Campaign;
  updateCampaign: (id: string, patch: Partial<Campaign>) => void;
  deleteCampaign: (id: string) => void;

  createContact: (patch: Partial<Contact>) => Contact;
  updateContact: (id: string, patch: Partial<Contact>) => void;
  deleteContact: (id: string) => void;

  createAutomation: (patch: Partial<Automation>) => Automation;
  updateAutomation: (id: string, patch: Partial<Automation>) => void;
  deleteAutomation: (id: string) => void;
  toggleAutomationStatus: (id: string) => void;
}

const actions: AppActions = {
  setDateRangePreset: (preset) => {
    setState((prev) => ({
      ...prev,
      ui: {
        ...(prev.ui ?? createSeedState().ui),
        dateRangePreset: preset,
      },
    }));
  },

  refreshChartData: () => {
    // For Supabase-configured sessions, refresh real metrics from DB.
    const preset = getState().ui?.dateRangePreset ?? '30d';
    if (isSupabaseConfigured()) {
      void fetchChartDataFromSupabase(preset)
        .then((real) => {
          if (!real) return;
          setState((prev) => ({
            ...prev,
            chartData: real,
            ui: { ...(prev.ui ?? createSeedState().ui), lastRefreshedAt: nowIso() },
          }));
          return refreshCampaignMetricsFromSupabase();
        })
        .catch((e) => console.warn('[flowmail] chart refresh failed:', e));
      void refreshAutomationMetricsFromSupabase().catch((e) => console.warn('[flowmail] automation refresh failed:', e));
      return;
    }

    // Local/demo mode: keep existing chart data
    setState((prev) => ({
      ...prev,
      ui: { ...(prev.ui ?? createSeedState().ui), lastRefreshedAt: nowIso() },
    }));
  },

  refreshAll: () => {
    if (isSupabaseConfigured()) {
      void hydrateFromSupabase();
      return;
    }
    // If Supabase isn't configured, do not generate demo data—just update the timestamp.
    setState((prev) => ({
      ...prev,
      ui: { ...(prev.ui ?? createSeedState().ui), lastRefreshedAt: nowIso() },
    }));
  },

  createCampaign: (patch) => {
    const createdAt = nowIso();
    const id = patch.id ?? uid('cmp');
    const status: Campaign['status'] = patch.status ?? 'Draft';
    const name = patch.name ?? patch.topic ?? 'New Campaign';

    const campaign: Campaign = {
      id,
      name,
      status,
      date: patch.date ?? formatDisplayDate(createdAt),
      topic: patch.topic,
      tone: patch.tone,
      subject: patch.subject,
      body: patch.body,
      emailBlocks: patch.emailBlocks,
      emailStyle: patch.emailStyle,
      segmentName: patch.segmentName,
          createdAt,
          updatedAt: createdAt,
      sentCount: patch.sentCount ?? 0,
      openCount: patch.openCount ?? 0,
      clickCount: patch.clickCount ?? 0,
      conversionCount: patch.conversionCount ?? 0,
      openRate: patch.openRate ?? (status === 'Sent' || status === 'Active' ? '0%' : '-'),
      clickRate: patch.clickRate ?? (status === 'Sent' || status === 'Active' ? '0%' : '-'),
    };

    setState((prev) => ({ ...prev, campaigns: [campaign, ...prev.campaigns] }));
    void getRepo().then((repo) => repo?.upsertCampaign(campaign));
    return campaign;
  },

  updateCampaign: (id, patch) => {
    setState((prev) => {
      const campaigns = prev.campaigns.map((c) => {
        if (c.id !== id) return c;
        const updatedAt = nowIso();
        const merged: Campaign = { ...c, ...patch, updatedAt };
        // keep legacy date field in sync when we have a meaningful update
        if (patch.status === 'Sent' && !merged.date) merged.date = formatDisplayDate(updatedAt);
        if (patch.sentCount != null && patch.openCount != null) {
          const sent = Math.max(0, patch.sentCount);
          const opens = Math.max(0, patch.openCount);
          merged.openRate = sent > 0 ? `${((opens / sent) * 100).toFixed(1)}%` : '0%';
        }
        if (patch.sentCount != null && patch.clickCount != null) {
          const sent = Math.max(0, patch.sentCount);
          const clicks = Math.max(0, patch.clickCount);
          merged.clickRate = sent > 0 ? `${((clicks / sent) * 100).toFixed(1)}%` : '0%';
        }
        return merged;
      });
      return { ...prev, campaigns };
    });
    void getRepo().then((repo) => {
      if (!repo) return;
      const c = getState().campaigns.find((x) => x.id === id);
      if (c) return repo.upsertCampaign(c);
    });
  },

  deleteCampaign: (id) => {
    setState((prev) => ({ ...prev, campaigns: prev.campaigns.filter((c) => c.id !== id) }));
    void getRepo().then((repo) => repo?.deleteCampaign(id));
  },

  createContact: (patch) => {
    const createdAt = nowIso();
    const id = patch.id ?? uid('ctc');
    const firstName = patch.firstName;
    const lastName = patch.lastName;
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    const name = patch.name ?? (fullName || patch.email || 'New Contact');

    const baseScore = patch.leadScore ?? 40;
    const leadScore = clamp(baseScore, 0, 100);

    const events: ContactEvent[] = [
      ...(patch.events ?? []),
      { id: uid('evt'), type: 'contact_created', title: 'Contact Created', occurredAt: createdAt },
    ];

    const contact: Contact = {
      id,
          name,
      email: patch.email ?? '',
      status: patch.status ?? 'Subscribed',
      addedDate: patch.addedDate ?? formatDisplayDate(createdAt),
      tags: patch.tags ?? [],
      firstName,
      lastName,
      phone: patch.phone,
      timezone: patch.timezone,
      lifecycleStage: patch.lifecycleStage,
      temperature: patch.temperature,
      lists: patch.lists,
      acquisitionSource: patch.acquisitionSource ?? 'Manual',
      lastOpenDate: patch.lastOpenDate,
      lastClickDate: patch.lastClickDate,
      leadScore,
      company: patch.company,
      jobTitle: patch.jobTitle,
      location: patch.location,
      website: patch.website,
          createdAt,
          updatedAt: createdAt,
      events,
    };

    setState((prev) => ({ ...prev, contacts: [contact, ...prev.contacts] }));
    void getRepo().then((repo) => repo?.upsertContact(contact));
    // Emit timeline trigger/event rows in Supabase (used by automation-scanner).
    void logContactEvent({
      contactId: contact.id,
      eventType: 'contact_created',
      title: 'Contact Created',
      occurredAt: createdAt,
      meta: { source: contact.acquisitionSource ?? 'manual' },
    });
    // If tags/lists were set during creation, also emit those trigger events.
    for (const t of uniqStrings(contact.tags)) {
      void logContactEvent({
        contactId: contact.id,
        eventType: 'tag_added',
        title: `Tag Added: ${t}`,
        occurredAt: createdAt,
        meta: { tag: t },
      });
    }
    for (const l of uniqStrings(contact.lists)) {
      void logContactEvent({
        contactId: contact.id,
        eventType: 'list_joined',
        title: `List Joined: ${l}`,
        occurredAt: createdAt,
        meta: { list: l },
      });
    }
    scheduleAutomationKickCurrent();
    // If created from a "website form", also emit a form_submitted trigger event.
    const src = String(contact.acquisitionSource ?? '').toLowerCase();
    if (src === 'website_form' || src === 'web form') {
      void logContactEvent({
        contactId: contact.id,
        eventType: 'form_submitted',
        title: 'Form Submitted',
        occurredAt: createdAt,
        meta: { form: 'Website Form' },
      });
      scheduleAutomationKickCurrent();
    }
    return contact;
  },

  updateContact: (id, patch) => {
    // Compute tag/list diffs before we update state.
    const prevContact = getState().contacts.find((c) => c.id === id) ?? null;
    const prevTags = uniqStrings(prevContact?.tags);
    const prevLists = uniqStrings(prevContact?.lists);
    const nextTags = patch.tags ? uniqStrings(patch.tags) : prevTags;
    const nextLists = patch.lists ? uniqStrings(patch.lists) : prevLists;
    const addedTags = nextTags.filter((t) => !prevTags.some((p) => p.toLowerCase() === t.toLowerCase()));
    const removedTags = prevTags.filter((t) => !nextTags.some((n) => n.toLowerCase() === t.toLowerCase()));
    const addedLists = nextLists.filter((t) => !prevLists.some((p) => p.toLowerCase() === t.toLowerCase()));
    const removedLists = prevLists.filter((t) => !nextLists.some((n) => n.toLowerCase() === t.toLowerCase()));

    setState((prev) => {
      const updatedAt = nowIso();
      const contacts = prev.contacts.map((c) => {
        if (c.id !== id) return c;
        const merged: Contact = { ...c, ...patch, updatedAt };
        if (patch.leadScore != null) merged.leadScore = clamp(patch.leadScore, 0, 100);
        if (patch.firstName != null || patch.lastName != null) {
          const fn = patch.firstName ?? merged.firstName;
          const ln = patch.lastName ?? merged.lastName;
          const full = [fn, ln].filter(Boolean).join(' ').trim();
          if (full) merged.name = full;
        }
        return merged;
      });
      return { ...prev, contacts };
    });
    void getRepo().then((repo) => {
      if (!repo) return;
      const c = getState().contacts.find((x) => x.id === id);
      if (c) return repo.upsertContact(c);
    });

    // Emit tag/list trigger events for automations (best-effort).
    const occurredAt = nowIso();
    for (const t of addedTags) {
      void logContactEvent({ contactId: id, eventType: 'tag_added', title: `Tag Added: ${t}`, occurredAt, meta: { tag: t } });
    }
    for (const t of removedTags) {
      void logContactEvent({ contactId: id, eventType: 'tag_removed', title: `Tag Removed: ${t}`, occurredAt, meta: { tag: t } });
    }
    for (const l of addedLists) {
      void logContactEvent({ contactId: id, eventType: 'list_joined', title: `List Joined: ${l}`, occurredAt, meta: { list: l } });
    }
    for (const l of removedLists) {
      void logContactEvent({ contactId: id, eventType: 'list_left', title: `List Left: ${l}`, occurredAt, meta: { list: l } });
    }
    if (addedTags.length || removedTags.length || addedLists.length || removedLists.length) {
      scheduleAutomationKickCurrent();
    }
  },

  deleteContact: (id) => {
    setState((prev) => ({ ...prev, contacts: prev.contacts.filter((c) => c.id !== id) }));
    void getRepo().then((repo) => repo?.deleteContact(id));
  },

  createAutomation: (patch) => {
    const createdAt = nowIso();
    const id = patch.id ?? uid('aut');
    const automation: Automation = {
      id,
      name: patch.name ?? 'Untitled Automation',
      runs: patch.runs ?? '0 contacts',
      status: patch.status ?? 'Paused',
      count: patch.count ?? 0,
      trigger: patch.trigger,
      steps: patch.steps ?? [],
          createdAt,
          updatedAt: createdAt,
      lastActivityAt: patch.lastActivityAt ?? createdAt,
    };
    setState((prev) => ({ ...prev, automations: [automation, ...prev.automations] }));
    void getRepo().then((repo) => repo?.upsertAutomation(automation));
    return automation;
  },

  updateAutomation: (id, patch) => {
    setState((prev) => {
      const updatedAt = nowIso();
      const automations = prev.automations.map((a) => (a.id === id ? { ...a, ...patch, updatedAt } : a));
      return { ...prev, automations };
    });
    void getRepo().then((repo) => {
      if (!repo) return;
      const a = getState().automations.find((x) => x.id === id);
      if (a) return repo.upsertAutomation(a);
        });
      },

  deleteAutomation: (id) => {
    setState((prev) => ({ ...prev, automations: prev.automations.filter((a) => a.id !== id) }));
    void getRepo().then((repo) => repo?.deleteAutomation(id));
  },

  toggleAutomationStatus: (id) => {
    setState((prev) => {
      const updatedAt = nowIso();
      const automations = prev.automations.map((a) => {
        if (a.id !== id) return a;
        const nextStatus: Automation['status'] = a.status === 'Running' ? 'Paused' : 'Running';
        return { ...a, status: nextStatus, updatedAt, lastActivityAt: updatedAt };
      });
      return { ...prev, automations };
    });
    void getRepo().then((repo) => {
      if (!repo) return;
      const a = getState().automations.find((x) => x.id === id);
      if (a) return repo.upsertAutomation(a);
    });
    // If we just resumed automations, try to process pending events immediately (no external cron required).
    const a = getState().automations.find((x) => x.id === id);
    if (a?.status === 'Running') scheduleAutomationKickCurrent();
  },
};

export function useAppStore(): { state: AppState; actions: AppActions } {
  const state = useSyncExternalStore(subscribe, getState, getState);
  // keep the return shape stable for consumers
  return useMemo(() => ({ state, actions }), [state]);
}

export function computeDashboardMetrics(state: AppState): Metric[] {
  const campaigns = state.campaigns ?? [];
  const contacts = state.contacts ?? [];

  const subscribed = contacts.filter((c) => c.status === 'Subscribed').length;
  const sentCampaigns = campaigns.filter((c) => c.status === 'Sent' || c.status === 'Active');
  const totalSent = sentCampaigns.reduce((sum, c) => sum + (c.sentCount ?? 0), 0);
  const totalOpens = sentCampaigns.reduce((sum, c) => sum + (c.openCount ?? 0), 0);
  const totalClicks = sentCampaigns.reduce((sum, c) => sum + (c.clickCount ?? 0), 0);

  const openRate = totalSent > 0 ? totalOpens / totalSent : 0;
  const clickRate = totalSent > 0 ? totalClicks / totalSent : 0;

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return [
    { label: 'Subscribers', value: subscribed.toLocaleString(), change: '—', trend: 'up' },
    { label: 'Campaigns', value: campaigns.length.toLocaleString(), change: '—', trend: 'up' },
    { label: 'Open Rate', value: pct(openRate), change: '—', trend: 'up' },
    { label: 'Click Rate', value: pct(clickRate), change: '—', trend: 'up' },
  ];
}

