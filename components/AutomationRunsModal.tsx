import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { getSupabase, getWorkspaceId } from '../services/supabase';

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
}: {
  isOpen: boolean;
  onClose: () => void;
  automationId: string | null;
}) {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(false);
  const ws = getWorkspaceId();

  const title = useMemo(() => (automationId ? `Runs: ${automationId}` : 'Automation Runs'), [automationId]);

  useEffect(() => {
    if (!isOpen) return;
    const sb = getSupabase();
    if (!sb) return;
    setLoading(true);
    (async () => {
      const q = sb
        .from('automation_runs')
        .select('id, automation_id, contact_id, status, current_step_id, started_at, finished_at, last_error')
        .eq('workspace_id', ws)
        .order('started_at', { ascending: false })
        .limit(50);
      const res = automationId ? await q.eq('automation_id', automationId) : await q;
      if (!res.error && Array.isArray(res.data)) {
        setRows(res.data as any);
      } else {
        setRows([]);
      }
      setLoading(false);
    })();
  }, [isOpen, automationId, ws]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <div className="font-semibold text-lg text-slate-900">{title}</div>
            <div className="text-xs text-slate-500">Last 50 runs (for debugging).</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="app-icon w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-slate-600 text-sm">Loading…</div>
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
                      <td className="px-4 py-3 text-slate-700">{r.contact_id}</td>
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


