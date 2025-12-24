import type { Automation, Campaign, Contact } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSeedState } from './seedData';
import type { ContactEvent } from '../types';

export type SupabaseRepo = {
  ensureSeedData: () => Promise<void>;
  fetchAll: () => Promise<{ contacts: Contact[]; campaigns: Campaign[]; automations: Automation[] }>;

  upsertContact: (contact: Contact) => Promise<void>;
  patchContact: (id: string, patch: Partial<Contact>) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;

  upsertCampaign: (campaign: Campaign) => Promise<void>;
  patchCampaign: (id: string, patch: Partial<Campaign>) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;

  upsertAutomation: (automation: Automation) => Promise<void>;
  patchAutomation: (id: string, patch: Partial<Automation>) => Promise<void>;
  deleteAutomation: (id: string) => Promise<void>;
};

type Table = 'contacts' | 'campaigns' | 'automations';

function shouldSeedDemoData(): boolean {
  // Default OFF for production. Turn on explicitly in dev if you want sample data.
  const p = (globalThis as any)?.process;
  const v = String(import.meta.env.VITE_SEED_DEMO_DATA ?? p?.env?.VITE_SEED_DEMO_DATA ?? '')
    .trim()
    .toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function throwIfError(res: { error: any }, ctx: string) {
  if (res.error) {
    const msg = typeof res.error?.message === 'string' ? res.error.message : String(res.error);
    throw new Error(`${ctx}: ${msg}`);
  }
}

const toIso = (v: any): string | undefined => {
  if (!v) return undefined;
  try { return new Date(v).toISOString(); } catch { return undefined; }
};

export function createSupabaseRepo(sb: SupabaseClient, workspaceId: string): SupabaseRepo {
  const ws = workspaceId || 'default';

  const contactToRow = (c: Contact) => ({
    workspace_id: ws,
    id: c.id,
    name: c.name,
    email: c.email,
    status: c.status,
    added_date: c.addedDate,
    tags: c.tags ?? [],
    first_name: c.firstName ?? null,
    last_name: c.lastName ?? null,
    phone: c.phone ?? null,
    timezone: c.timezone ?? null,
    lifecycle_stage: c.lifecycleStage ?? null,
    temperature: c.temperature ?? null,
    lists: c.lists ?? [],
    acquisition_source: c.acquisitionSource ?? null,
    last_open_date: c.lastOpenDate ? new Date(c.lastOpenDate).toISOString() : null,
    last_click_date: c.lastClickDate ? new Date(c.lastClickDate).toISOString() : null,
    last_purchase_date: c.lastPurchaseDate ? new Date(c.lastPurchaseDate).toISOString() : null,
    total_emails_sent: c.totalEmailsSent ?? 0,
    total_opens: c.totalOpens ?? 0,
    total_clicks: c.totalClicks ?? 0,
    total_purchases: c.totalPurchases ?? 0,
    unsubscribed: c.unsubscribed ?? (c.status === 'Unsubscribed'),
    bounced: c.bounced ?? (c.status === 'Bounced'),
    spam_complaint: c.spamComplaint ?? false,
    lead_score: typeof c.leadScore === 'number' ? c.leadScore : null,
    company: c.company ?? null,
    job_title: c.jobTitle ?? null,
    location: c.location ?? null,
    website: c.website ?? null,
    events: c.events ?? null,
    created_at: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const rowToContact = (r: any): Contact => ({
    id: r.id,
    name: r.name,
    email: r.email,
    status: r.status,
    addedDate: r.added_date,
    tags: r.tags ?? [],
    firstName: r.first_name ?? undefined,
    lastName: r.last_name ?? undefined,
    phone: r.phone ?? undefined,
    timezone: r.timezone ?? undefined,
    lifecycleStage: r.lifecycle_stage ?? undefined,
    temperature: r.temperature ?? undefined,
    lists: r.lists ?? undefined,
    acquisitionSource: r.acquisition_source ?? undefined,
    lastOpenDate: toIso(r.last_open_date),
    lastClickDate: toIso(r.last_click_date),
    lastPurchaseDate: toIso(r.last_purchase_date),
    totalEmailsSent: typeof r.total_emails_sent === 'number' ? r.total_emails_sent : undefined,
    totalOpens: typeof r.total_opens === 'number' ? r.total_opens : undefined,
    totalClicks: typeof r.total_clicks === 'number' ? r.total_clicks : undefined,
    totalPurchases: typeof r.total_purchases === 'number' ? r.total_purchases : undefined,
    unsubscribed: typeof r.unsubscribed === 'boolean' ? r.unsubscribed : undefined,
    bounced: typeof r.bounced === 'boolean' ? r.bounced : undefined,
    spamComplaint: typeof r.spam_complaint === 'boolean' ? r.spam_complaint : undefined,
    leadScore: typeof r.lead_score === 'number' ? r.lead_score : undefined,
    company: r.company ?? undefined,
    jobTitle: r.job_title ?? undefined,
    location: r.location ?? undefined,
    website: r.website ?? undefined,
    events: r.events ?? undefined,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  });

  const campaignToRow = (c: Campaign) => ({
    workspace_id: ws,
    id: c.id,
    name: c.name,
    date: c.date ?? null,
    status: c.status,
    open_rate: c.openRate ?? null,
    click_rate: c.clickRate ?? null,
    subject: c.subject ?? null,
    body: c.body ?? null,
    topic: c.topic ?? null,
    tone: c.tone ?? null,
    sent_count: c.sentCount ?? null,
    open_count: c.openCount ?? null,
    click_count: c.clickCount ?? null,
    conversion_count: c.conversionCount ?? null,
    segment_name: c.segmentName ?? null,
    email_blocks: c.emailBlocks ?? null,
    email_style: c.emailStyle ?? null,
    created_at: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const rowToCampaign = (r: any): Campaign => ({
    id: r.id,
    name: r.name,
    date: r.date ?? '',
    status: r.status,
    openRate: r.open_rate ?? undefined,
    clickRate: r.click_rate ?? undefined,
    subject: r.subject ?? undefined,
    body: r.body ?? undefined,
    topic: r.topic ?? undefined,
    tone: r.tone ?? undefined,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
    sentCount: typeof r.sent_count === 'number' ? r.sent_count : undefined,
    openCount: typeof r.open_count === 'number' ? r.open_count : undefined,
    clickCount: typeof r.click_count === 'number' ? r.click_count : undefined,
    conversionCount: typeof r.conversion_count === 'number' ? r.conversion_count : undefined,
    segmentName: r.segment_name ?? undefined,
    emailBlocks: r.email_blocks ?? undefined,
    emailStyle: r.email_style ?? undefined,
  });

  const automationToRow = (a: Automation) => ({
    workspace_id: ws,
    id: a.id,
    name: a.name,
    runs: a.runs ?? null,
    status: a.status,
    count: a.count ?? 0,
    trigger: a.trigger ?? null,
    last_activity_at: a.lastActivityAt ? new Date(a.lastActivityAt).toISOString() : null,
    steps: a.steps ?? null,
    created_at: a.createdAt ? new Date(a.createdAt).toISOString() : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const rowToAutomation = (r: any): Automation => ({
    id: r.id,
    name: r.name,
    runs: r.runs ?? '0 contacts',
    status: r.status,
    count: typeof r.count === 'number' ? r.count : 0,
    trigger: r.trigger ?? undefined,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
    lastActivityAt: toIso(r.last_activity_at),
    steps: r.steps ?? undefined,
  });

  async function count(table: Table): Promise<number> {
    const res = await sb.from(table).select('id', { count: 'exact', head: true }).eq('workspace_id', ws);
    throwIfError(res, `count(${table})`);
    return res.count ?? 0;
  }

  async function ensureSeedData() {
    if (!shouldSeedDemoData()) return;
    const [c1, c2, c3] = await Promise.all([count('contacts'), count('campaigns'), count('automations')]);
    if (c1 > 0 || c2 > 0 || c3 > 0) return;
    const seed = createSeedState();
    let res = await sb.from('contacts').insert(seed.contacts.map(contactToRow) as any);
    throwIfError(res, 'seed contacts');
    res = await sb.from('campaigns').insert(seed.campaigns.map(campaignToRow) as any);
    throwIfError(res, 'seed campaigns');
    res = await sb.from('automations').insert(seed.automations.map(automationToRow) as any);
    throwIfError(res, 'seed automations');

    // Seed contact_events from legacy embedded events if table exists.
    const events: Array<{ workspace_id: string; contact_id: string; event_type: string; title: string; occurred_at: string; meta?: any }> = [];
    for (const c of seed.contacts) {
      for (const e of (c.events ?? [])) {
        events.push({
          workspace_id: ws,
          contact_id: c.id,
          event_type: e.type,
          title: e.title,
          occurred_at: e.occurredAt,
          meta: e.meta ?? null,
        });
      }
    }
    if (events.length > 0) {
      try {
        const ins = await sb.from('contact_events').insert(events as any);
        // if the table doesn't exist yet, ignore; schema.sql adds it.
        if (ins.error) console.warn('[flowmail] seed contact_events skipped:', ins.error.message);
      } catch {
        // ignore
      }
    }
  }

  async function fetchAll() {
    const [contactsRes, campaignsRes, automationsRes] = await Promise.all([
      sb.from('contacts').select('*').eq('workspace_id', ws),
      sb.from('campaigns').select('*').eq('workspace_id', ws),
      sb.from('automations').select('*').eq('workspace_id', ws),
    ]);
    throwIfError(contactsRes, 'fetch contacts');
    throwIfError(campaignsRes, 'fetch campaigns');
    throwIfError(automationsRes, 'fetch automations');
    const contacts = (contactsRes.data ?? []).map(rowToContact);

    // Fetch timeline events (new table) and attach to contacts for the Contact Detail view.
    const contactIds = contacts.map((c) => c.id).filter(Boolean);
    let eventsByContact = new Map<string, ContactEvent[]>();
    if (contactIds.length > 0) {
      const evRes = await sb
        .from('contact_events')
        .select('id, contact_id, event_type, title, occurred_at, meta')
        .eq('workspace_id', ws)
        .in('contact_id', contactIds)
        .order('occurred_at', { ascending: false });
      if (!evRes.error && Array.isArray(evRes.data)) {
        for (const r of evRes.data as any[]) {
          const ev: ContactEvent = {
            id: String(r.id),
            type: r.event_type,
            title: r.title,
            occurredAt: new Date(r.occurred_at).toISOString(),
            meta: r.meta ?? undefined,
          } as any;
          const arr = eventsByContact.get(r.contact_id) ?? [];
          arr.push(ev);
          eventsByContact.set(r.contact_id, arr);
        }
      }
    }

    const enriched = contacts.map((c) => {
      const ev = eventsByContact.get(c.id);
      return ev && ev.length > 0 ? { ...c, events: ev } : c;
    });

    return {
      contacts: enriched,
      campaigns: (campaignsRes.data ?? []).map(rowToCampaign),
      automations: (automationsRes.data ?? []).map(rowToAutomation),
    };
  }

  async function upsert(table: Table, row: any) {
    const res = await sb.from(table).upsert(row, { onConflict: 'workspace_id,id' });
    throwIfError(res, `upsert ${table}`);
  }

  async function patch(table: Table, id: string, mapped: any) {
    const res = await sb.from(table).update(mapped).eq('workspace_id', ws).eq('id', id);
    throwIfError(res, `patch ${table}`);
  }

  async function del(table: Table, id: string) {
    const res = await sb.from(table).delete().eq('workspace_id', ws).eq('id', id);
    throwIfError(res, `delete ${table}`);
  }

  return {
    ensureSeedData,
    fetchAll,

    upsertContact: async (c) => upsert('contacts', contactToRow(c)),
    patchContact: async (id, p) => patch('contacts', id, { ...p, updated_at: new Date().toISOString() }),
    deleteContact: async (id) => del('contacts', id),

    upsertCampaign: async (c) => upsert('campaigns', campaignToRow(c)),
    patchCampaign: async (id, p) => patch('campaigns', id, { ...p, updated_at: new Date().toISOString() }),
    deleteCampaign: async (id) => del('campaigns', id),

    upsertAutomation: async (a) => upsert('automations', automationToRow(a)),
    patchAutomation: async (id, p) => patch('automations', id, { ...p, updated_at: new Date().toISOString() }),
    deleteAutomation: async (id) => del('automations', id),
  };
}


