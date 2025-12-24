import { useMemo, useSyncExternalStore } from 'react';
import type { Automation, Campaign, ChartData, Contact, Metric, WorkspaceSettings, ContactEvent } from '../types';
import { createSeedState } from '../services/seedData';
import { loadFromStorage, saveToStorage } from '../services/storage';
import { getSupabase, getWorkspaceId, isSupabaseConfigured } from '../services/supabase';
import { createSupabaseRepo, type SupabaseRepo } from '../services/supabaseRepo';

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

const STORAGE_KEY = 'flowmail.ai.appState.v1';

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
let supaInitStarted = false;

async function getRepo(): Promise<SupabaseRepo | null> {
  if (!isSupabaseConfigured()) return null;
  if (supaRepo) return supaRepo;
  const sb = getSupabase();
  if (!sb) return null;
  supaRepo = createSupabaseRepo(sb, getWorkspaceId());
  return supaRepo;
}

async function hydrateFromSupabase(): Promise<void> {
  try {
    const repo = await getRepo();
    if (!repo) return;
    await repo.ensureSeedData();
    const data = await repo.fetchAll();
    setState((prev) => ({
      ...prev,
      contacts: data.contacts,
      campaigns: data.campaigns,
      automations: data.automations,
    }));
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
        })
        .catch((e) => console.warn('[flowmail] chart refresh failed:', e));
      return;
    }

    // Local/demo mode: keep existing chart data
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
    return contact;
  },

  updateContact: (id, patch) => {
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

