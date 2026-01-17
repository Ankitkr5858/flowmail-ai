import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { getSupabase, isSupabaseConfigured } from '../services/supabase';
import { invokeEdgeFunction } from '../services/edgeFunctions';

type RunRow = {
  id: string;
  automation_id: string;
  contact_id: string;
  status: string;
  current_step_id?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  last_error?: string | null;
};

export default function AutomationRunsModal({
  isOpen,
  onClose,
  automationId,
  runId,
}: {
  isOpen: boolean;
  onClose: () => void;
  automationId: string | null;
  runId?: string | null;
}) {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [contactLabel, setContactLabel] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const title = useMemo(() => ('Automation Runs'), []);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    (async () => {
      setError('');
      let nextRows: any[] = [];
      let edgeFailed = false;

      // Prefer Edge Function (service-role read) so this works even if automation_runs RLS policies are missing.
      if (isSupabaseConfigured()) {
        try {
          const out: any = await invokeEdgeFunction('automation-runs', {
            // Let the Edge Function derive workspaceId from the caller's JWT (more reliable than localStorage).
            automationId,
            runId,
            limit: 50,
          });
          nextRows = Array.isArray(out?.rows) ? out.rows : [];
        } catch (e) {
          edgeFailed = true;
          const msg = e instanceof Error ? e.message : String(e);
          // Only show an error if direct reads also fail; keep this quiet for now.
          setError(msg);
        }
      }

      // If the edge function isn't deployed (or failed), try direct reads as a fallback.
      if (edgeFailed) {
        const sb = getSupabase();
        if (sb) {
          const q = sb
            .from('automation_runs')
            .select('id, automation_id, contact_id, status, current_step_id, started_at, finished_at, last_error')
            .order('started_at', { ascending: false })
            .limit(50);
          const res = runId
            ? await q.eq('id', runId).limit(1)
            : automationId
              ? await q.eq('automation_id', automationId)
              : await q;
          if (!res.error && Array.isArray(res.data)) {
            nextRows = res.data as any[];
            setError(''); // direct read succeeded
          } else if (res.error?.message) {
            setError(String(res.error.message));
          }
        }
      }

      setRows(nextRows as any);
      const ids = Array.from(new Set((nextRows as any[]).map((r) => String(r.contact_id ?? '')).filter(Boolean)));
        if (ids.length > 0) {
          const sb = getSupabase();
          if (!sb) {
            setContactLabel({});
            setLoading(false);
            return;
          }
          const { data: cRows } = await sb
            .from('contacts')
            .select('id,first_name,last_name,email')
            .in('id', ids.slice(0, 200));
          const map: Record<string, string> = {};
          (cRows ?? []).forEach((c: any) => {
            const fn = String(c?.first_name ?? '').trim();
            const ln = String(c?.last_name ?? '').trim();
            const em = String(c?.email ?? '').trim();
            map[String(c.id)] = [fn, ln].filter(Boolean).join(' ') || em || 'Contact';
          });
          setContactLabel(map);
        } else {
          setContactLabel({});
        }
      setLoading(false);
    })();
  }, [isOpen, automationId, runId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <div className="font-semibold text-lg text-slate-900">{title}</div>
            <div className="text-xs text-slate-500">Latest activity</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="app-icon w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-slate-600 text-sm">Loading…</div>
          ) : error ? (
            <div className="text-red-700 text-sm whitespace-pre-line">Failed to load runs.\n\n{error}</div>
          ) : rows.length === 0 && runId ? (
            <div className="text-slate-700 text-sm whitespace-pre-line">
              No runs found for this test run id.
              {'\n\n'}
              This usually means the app can’t read `automation_runs` due to Supabase RLS, and the `automation-runs` Edge Function isn’t deployed yet.
              {'\n\n'}
              Fix: deploy the Edge Function `automation-runs`, then refresh and try again.
              {'\n\n'}
              Run id: {runId}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-slate-600 text-sm">No runs yet.</div>
          ) : (
            <div className="overflow-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Started</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Finished</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900">{r.status}</td>
                      <td className="px-4 py-3 text-slate-700">{contactLabel[r.contact_id] ?? 'Contact'}</td>
                      <td className="px-4 py-3 text-slate-700">{r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{r.finished_at ? new Date(r.finished_at).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{r.last_error ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


