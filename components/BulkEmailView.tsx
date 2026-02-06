import React, { useEffect, useMemo, useState } from 'react';
import { Send, SlidersHorizontal, Users } from 'lucide-react';
import { invokeEdgeFunction } from '../services/edgeFunctions';
import { getWorkspaceId } from '../services/supabase';
import SegmentBuilderModal, { type SegmentDefinition } from './SegmentBuilderModal';
import ContactPickerModal from './ContactPickerModal';
import { useAppStore } from '../store/AppStore';

export default function BulkEmailView() {
  const workspaceId = useMemo(() => getWorkspaceId() || 'default', []);
  const { state } = useAppStore();
  const contacts = state.contacts ?? [];

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [maxRecipients, setMaxRecipients] = useState<number>(1000);

  const [recipientMode, setRecipientMode] = useState<'all' | 'selected'>('all');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [useSegment, setUseSegment] = useState(false);
  const [segment, setSegment] = useState<SegmentDefinition>({ logic: 'AND', conditions: [] });
  const [segOpen, setSegOpen] = useState(false);

  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ eligibleCount: number; fromEmail: string | null } | null>(null);

  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [sendInstantly, setSendInstantly] = useState<boolean>(true);

  const segmentKey = useMemo(() => {
    try {
      return JSON.stringify(segment);
    } catch {
      return '';
    }
  }, [segment]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // Only preview when the core fields are present.
      if (!subject.trim() || !body.trim()) {
        setPreview(null);
        setPreviewError(null);
        setPreviewBusy(false);
        return;
      }
      try {
        setPreviewBusy(true);
        setPreviewError(null);
        setPreview(null);
        const data = await invokeEdgeFunction<any>('send-bulk-email', {
          workspaceId,
          subject,
          body,
          dryRun: true,
          sampleSize: 0,
          maxRecipients,
          pageSize: 500,
          segmentJson: recipientMode === 'all' && useSegment ? segment : null,
          contactIds: recipientMode === 'selected' ? selectedContactIds : null,
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
  }, [workspaceId, subject, body, maxRecipients, recipientMode, selectedContactIds.join(','), useSegment, segmentKey]);

  const send = async () => {
    setMessage(null);
    if (!subject.trim() || !body.trim()) {
      setMessage({ kind: 'err', text: 'Subject and body are required.' });
      return;
    }
    try {
      setSending(true);
      const data = await invokeEdgeFunction<any>('send-bulk-email', {
        workspaceId,
        subject,
        body,
        maxRecipients,
        pageSize: 500,
        segmentJson: recipientMode === 'all' && useSegment ? segment : null,
        contactIds: recipientMode === 'selected' ? selectedContactIds : null,
        sendImmediately: sendInstantly,
      });
      const mode = String((data as any)?.mode ?? '');
      if (mode === 'instant') {
        const sent = Number((data as any)?.sent ?? 0);
        const failed = Number((data as any)?.failed ?? 0);
        const errors = Array.isArray((data as any)?.errors) ? ((data as any).errors as any[]) : [];
        const errorText =
          failed > 0 && errors.length > 0
            ? `\n\nTop error:\n${String(errors[0]?.to ?? '')}: ${String(errors[0]?.error ?? '')}`
            : '';
        setMessage({
          kind: failed > 0 ? 'err' : 'ok',
          text: `Sent ${sent} emails instantly.${failed > 0 ? ` Failed: ${failed}.` : ''}${errorText}`,
        });
      } else {
        const queued = Number((data as any)?.queued ?? 0);
        setMessage({ kind: 'ok', text: `Queued ${queued} emails for delivery.` });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage({ kind: 'err', text: msg });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Bulk Email</h1>
        <p className="text-slate-500 text-sm mt-1">Send a one-off email to your contacts (optional segment filtering).</p>
      </div>

      {message && (
        <div
          className={`rounded-xl p-4 text-sm border ${
            message.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Delivery</div>
              <div className="text-xs text-slate-500">
                Instant mode sends immediately via Resend (best for small batches). Queue mode uses the background worker.
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 select-none">
              <input
                type="checkbox"
                checked={sendInstantly}
                onChange={(e) => setSendInstantly(e.target.checked)}
                className="h-4 w-4"
              />
              Send instantly
            </label>
          </div>
          {sendInstantly && (
            <div className="mt-2 text-xs text-slate-500">
              Note: Instant send requires the `RESEND_API_KEY` secret set for the `send-bulk-email` function and supports up to 50 recipients per send.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Recipients</div>
              <div className="text-xs text-slate-500">
                Choose whether to send to all subscribed contacts or pick specific recipients.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setRecipientMode('all'); setSelectedContactIds([]); }}
                className={`px-3 py-2 rounded-lg border text-sm font-semibold ${
                  recipientMode === 'all' ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                All subscribed
              </button>
              <button
                type="button"
                onClick={() => setRecipientMode('selected')}
                className={`px-3 py-2 rounded-lg border text-sm font-semibold flex items-center gap-2 ${
                  recipientMode === 'selected' ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Users className="app-icon w-4 h-4" />
                Selected
              </button>
            </div>
          </div>

          {recipientMode === 'selected' && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-sm text-slate-700">
                Selected recipients: <span className="font-semibold">{selectedContactIds.length}</span>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 font-semibold text-sm"
              >
                Choose contacts
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
            placeholder="e.g. Quick update"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full min-h-[220px] bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
            placeholder="You can use variables like {{firstName}}, {{lastName}}, {{email}}, {{companyName}}, {{senderName}}"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              {recipientMode === 'selected'
                ? 'When using Selected recipients, this caps how many of your selected contacts will be enqueued.'
                : 'Enqueues up to this many eligible contacts.'}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Segment</div>
                <div className="text-xs text-slate-500">
                  {recipientMode === 'selected' ? 'Disabled when selecting specific contacts.' : 'Optional recipient filtering.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUseSegment((v) => !v)}
                disabled={recipientMode === 'selected'}
                className={`px-3 py-2 rounded-lg border text-sm font-semibold flex items-center gap-2 ${
                  (recipientMode === 'selected')
                    ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                    : (useSegment ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100')
                }`}
              >
                <SlidersHorizontal className="app-icon w-4 h-4" />
                {useSegment ? 'On' : 'Off'}
              </button>
            </div>
            {useSegment && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setSegOpen(true)}
                  className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 font-semibold text-sm"
                >
                  Edit segment
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-line">
          {previewBusy
            ? 'Loading recipient preview…'
            : previewError
              ? `Could not load recipient preview.\n\nError: ${previewError}\n\nYou can still send if you want.`
              : subject.trim() && body.trim()
                ? `Eligible recipients: ${preview?.eligibleCount ?? 0}\nFrom: ${preview?.fromEmail ?? '(not set)'}`
                : 'Fill in subject + body to see a recipient preview.'}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || previewBusy}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
          >
            <Send className="app-icon w-4 h-4" />
            {sending ? 'Sending…' : 'Send bulk email'}
          </button>
        </div>
      </div>

      <SegmentBuilderModal isOpen={segOpen} onClose={() => setSegOpen(false)} value={segment} onChange={setSegment} />
      <ContactPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        contacts={contacts}
        selectedIds={selectedContactIds}
        onChange={setSelectedContactIds}
      />
    </div>
  );
}

