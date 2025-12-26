import { getSupabase, getWorkspaceId, isSupabaseConfigured } from './supabase';

export type ContactEventInsert = {
  contactId: string;
  eventType: string;
  title: string;
  occurredAt?: string; // ISO
  meta?: Record<string, any> | null;
  campaignId?: string | null;
};

export async function logContactEvent(ev: ContactEventInsert): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  if (!sb) return;
  const ws = getWorkspaceId() || 'default';

  const occurredAt = ev.occurredAt ?? new Date().toISOString();
  // RLS: workspace_id must match auth.uid()::text for authenticated callers.
  // In this app, workspace_id is typically auth.uid(); getWorkspaceId() follows that.
  const { error } = await sb.from('contact_events').insert({
    workspace_id: ws,
    contact_id: ev.contactId,
    event_type: ev.eventType,
    title: ev.title,
    occurred_at: occurredAt,
    meta: ev.meta ?? null,
    campaign_id: ev.campaignId ?? null,
  } as any);
  if (error) {
    // Keep UI resilient; logging should not break primary actions.
    // eslint-disable-next-line no-console
    console.warn('[flowmail] logContactEvent failed:', error.message);
  }
}


