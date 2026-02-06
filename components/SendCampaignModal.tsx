import React, { useEffect, useMemo, useState } from 'react';
import { X, Send, SlidersHorizontal } from 'lucide-react';
import { invokeEdgeFunction } from '../services/edgeFunctions';
import { getWorkspaceId } from '../services/supabase';
import SegmentBuilderModal, { type SegmentDefinition } from './SegmentBuilderModal';

export default function SendCampaignModal({
  isOpen,
  campaignId,
  onClose,
  onConfirm,
  isSending,
}: {
  isOpen: boolean;
  campaignId: string;
  onClose: () => void;
  onConfirm: (args: { maxRecipients: number; segmentJson: SegmentDefinition | null }) => void;
  isSending: boolean;
}) {
  const [maxRecipients, setMaxRecipients] = useState<number>(1000);
  const [useSegment, setUseSegment] = useState(false);
  const [segment, setSegment] = useState<SegmentDefinition>({ logic: 'AND', conditions: [] });
  const [segOpen, setSegOpen] = useState(false);

  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ eligibleCount: number; fromEmail: string | null } | null>(null);

  const workspaceId = useMemo(() => getWorkspaceId() || 'default', []);
  const segmentKey = useMemo(() => {
    try {
      return JSON.stringify(segment);
    } catch {
      return '';
    }
  }, [segment]);

  useEffect(() => {
    if (!isOpen) return;
    setMaxRecipients(1000);
    setUseSegment(false);
    setSegment({ logic: 'AND', conditions: [] });
    setPreviewBusy(false);
    setPreviewError(null);
    setPreview(null);
    setSegOpen(false);
  }, [isOpen, campaignId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isOpen || !campaignId) return;
      try {
        setPreviewBusy(true);
        setPreviewError(null);
        setPreview(null);
        const data = await invokeEdgeFunction<any>('send-campaign', {
          campaignId,
          workspaceId,
          dryRun: true,
          sampleSize: 0,
          maxRecipients,
          pageSize: 500,
          segmentJson: useSegment ? segment : null,
        });
        if (cancelled) return;
        setPreview({
          eligibleCount: Number((data as any)?.eligibleCount ?? 0),
          fromEmail: (data as any)?.fromEmail ? String((data as any).fromEmail) : null,
        });
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setPreviewError(msg);
      } finally {
        if (!cancelled) setPreviewBusy(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, campaignId, workspaceId, maxRecipients, useSegment, segmentKey]);

  if (!isOpen) return null;

  const sendDisabled = !campaignId || isSending || previewBusy;
  const eligible = preview?.eligibleCount ?? 0;

  return (
    <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <div className="font-semibold text-lg text-slate-900">Send campaign</div>
            <div className="text-xs text-slate-500">Choose your audience and enqueue emails for delivery.</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="app-icon w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Max recipients</label>
              <input
                type="number"
                min={1}
                max={10000}
                value={maxRecipients}
                onChange={(e) => setMaxRecipients(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))}
                className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
              />
              <div className="text-xs text-slate-500 mt-1">
                We’ll enqueue up to this many eligible contacts (Subscribed, not suppressed).
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Recipients (optional segment)</div>
                  <div className="text-xs text-slate-500">Filter recipients using the same segment builder used in Contacts.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setUseSegment((v) => !v)}
                  className={`px-3 py-2 rounded-lg border text-sm font-semibold flex items-center gap-2 ${
                    useSegment ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <SlidersHorizontal className="app-icon w-4 h-4" />
                  {useSegment ? 'Segment on' : 'Segment off'}
                </button>
              </div>
              {useSegment && (
                <div className="mt-3">
                  <button
                    type="button"
                    className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-semibold text-sm"
                    onClick={() => setSegOpen(true)}
                  >
                    Edit segment
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-line">
              {previewBusy
                ? 'Loading recipient preview…'
                : previewError
                  ? `Could not load recipient preview.\n\nError: ${previewError}\n\nYou can still send if you want.`
                  : `Eligible recipients: ${eligible}\nFrom: ${preview?.fromEmail ?? '(not set)'}\n\nAfter sending, open Reports → select this campaign to see delivery and engagement.`}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ maxRecipients, segmentJson: useSegment ? segment : null })}
            disabled={sendDisabled}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <Send className="app-icon w-4 h-4" />
            {isSending ? 'Sending…' : 'Send now'}
          </button>
        </div>

        <SegmentBuilderModal isOpen={segOpen} onClose={() => setSegOpen(false)} value={segment} onChange={setSegment} />
      </div>
    </div>
  );
}

