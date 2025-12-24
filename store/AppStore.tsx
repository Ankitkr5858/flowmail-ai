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

function seededRand(seed: number): () => number {
  // Simple LCG for deterministic-ish UI data.
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function generateChartData(seed: number, preset: DateRangePreset, base?: ChartData[]): ChartData[] {
  const rand = seededRand(seed);
  const scale = preset === '90d' ? 1.12 : preset === 'ytd' ? 1.24 : 1.0;
  const input = (base && base.length > 0) ? base : createSeedState().chartData;

  return input.map((p, idx) => {
    const jitter = 0.88 + rand() * 0.28; // 0.88 - 1.16
    const wave = 0.92 + Math.sin((idx + 1) * 0.9) * 0.07;
    const k = scale * jitter * wave;
    return {
      name: p.name,
      opens: Math.max(0, Math.round(p.opens * k)),
      clicks: Math.max(0, Math.round(p.clicks * k)),
      conversions: Math.max(0, Math.round(p.conversions * k)),
    };
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
    setState((prev) => {
      const ui = prev.ui ?? createSeedState().ui;
      const nextSeed = (ui.chartSeed ?? 1) + 1;
      const preset = ui.dateRangePreset ?? '30d';
      return {
        ...prev,
        chartData: generateChartData(nextSeed, preset, prev.chartData),
        ui: {
          ...ui,
          chartSeed: nextSeed,
          lastRefreshedAt: nowIso(),
        },
      };
    });
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

  // Small deterministic deltas for UI polish
  const seed = state.ui?.chartSeed ?? 1;
  const rand = seededRand(seed);
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const delta = () => {
    const v = (rand() * 0.12) - 0.04; // -4% to +8%
    const sign = v >= 0 ? '+' : '';
    return { value: `${sign}${(v * 100).toFixed(1)}%`, trend: v >= 0 ? 'up' as const : 'down' as const };
  };

  const d1 = delta();
  const d2 = delta();
  const d3 = delta();
  const d4 = delta();

  return [
    { label: 'Subscribers', value: subscribed.toLocaleString(), change: d1.value, trend: d1.trend },
    { label: 'Campaigns', value: campaigns.length.toLocaleString(), change: d2.value, trend: d2.trend },
    { label: 'Open Rate', value: pct(openRate), change: d3.value, trend: d3.trend },
    { label: 'Click Rate', value: pct(clickRate), change: d4.value, trend: d4.trend },
  ];
}

