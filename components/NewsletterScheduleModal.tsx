import React, { useEffect, useMemo, useState } from 'react';
import { X, Save } from 'lucide-react';
import { getSupabase, getWorkspaceId } from '../services/supabase';
import { Select } from './ui/Select';
import SegmentBuilderModal, { type SegmentDefinition } from './SegmentBuilderModal';

type Cadence = 'weekly' | 'monthly';

export default function NewsletterScheduleModal({
  isOpen,
  onClose,
  campaignId,
}: {
  isOpen: boolean;
  onClose: () => void;
  campaignId: string;
}) {
  const [cadence, setCadence] = useState<Cadence>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState<number>(1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [sendTime, setSendTime] = useState<string>('09:00');
  const [timezone, setTimezone] = useState<string>('UTC');
  const [status, setStatus] = useState<'active' | 'paused'>('active');
  const [name, setName] = useState<string>('Newsletter');
  const [segment, setSegment] = useState<SegmentDefinition>({ logic: 'AND', conditions: [] });
  const [segOpen, setSegOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCadence('weekly');
    setDayOfWeek(1);
    setDayOfMonth(1);
    setSendTime('09:00');
    setTimezone('UTC');
    setStatus('active');
    setName('Newsletter');
    setSegment({ logic: 'AND', conditions: [] });
    setSaving(false);
  }, [isOpen, campaignId]);

  const canSave = useMemo(() => campaignId.length > 0 && sendTime.includes(':'), [campaignId, sendTime]);

  const save = async () => {
    if (!canSave) return;
    const sb = getSupabase();
    if (!sb) return;
    setSaving(true);
    try {
      const ws = getWorkspaceId();
      const nextRunAt = new Date().toISOString(); // run ASAP; scheduler will advance after run
      const row: any = {
        workspace_id: ws,
        campaign_id: campaignId,
        status,
        cadence,
        day_of_week: cadence === 'weekly' ? dayOfWeek : null,
        day_of_month: cadence === 'monthly' ? dayOfMonth : null,
        send_time: sendTime,
        timezone,
        next_run_at: nextRunAt,
        name,
        segment_json: segment,
      };
      const { error } = await sb.from('newsletter_schedules').insert(row);
      if (error) throw new Error(error.message);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      window.alert(`Failed to save schedule: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <div className="font-semibold text-lg text-slate-900">Schedule Newsletter</div>
            <div className="text-xs text-slate-500">Set when this newsletter should go out.</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="app-icon w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <Select<'active' | 'paused'>
                value={status}
                onChange={setStatus}
                options={[
                  { value: 'active', label: 'active' },
                  { value: 'paused', label: 'paused' },
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cadence</label>
              <Select<Cadence>
                value={cadence}
                onChange={setCadence}
                options={[
                  { value: 'weekly', label: 'weekly' },
                  { value: 'monthly', label: 'monthly' },
                ]}
              />
            </div>
            {cadence === 'weekly' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Day of week</label>
                <Select<number>
                  value={dayOfWeek}
                  onChange={setDayOfWeek}
                  options={[
                    { value: 0, label: 'Sunday' },
                    { value: 1, label: 'Monday' },
                    { value: 2, label: 'Tuesday' },
                    { value: 3, label: 'Wednesday' },
                    { value: 4, label: 'Thursday' },
                    { value: 5, label: 'Friday' },
                    { value: 6, label: 'Saturday' },
                  ]}
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Day of month</label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Number(e.target.value))}
                  className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Send time (HH:MM)</label>
              <input
                value={sendTime}
                onChange={(e) => setSendTime(e.target.value)}
                className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Recipients (segment)</div>
                <div className="text-xs text-slate-500">Choose who should receive it.</div>
              </div>
              <button
                type="button"
                className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-semibold text-sm"
                onClick={() => setSegOpen(true)}
              >
                Edit segment
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave || saving}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="app-icon w-4 h-4" />
            {saving ? 'Saving…' : 'Save schedule'}
          </button>
        </div>

        <SegmentBuilderModal
          isOpen={segOpen}
          onClose={() => setSegOpen(false)}
          value={segment}
          onChange={setSegment}
        />
      </div>
    </div>
  );
}


