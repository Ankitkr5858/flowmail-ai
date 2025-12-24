import React, { useEffect, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { invokeEdgeFunction } from '../services/edgeFunctions';
import type { SegmentDefinition } from './SegmentBuilderModal';
import { getWorkspaceId } from '../services/supabase';

type Suggestion = {
  key: string;
  title: string;
  description: string;
  segment: SegmentDefinition;
};

export default function SegmentSuggestionsModal({
  isOpen,
  onClose,
  onApply,
}: {
  isOpen: boolean;
  onClose: () => void;
  onApply: (segment: SegmentDefinition) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    setSuggestions([]);
    (async () => {
      try {
        const ws = getWorkspaceId();
        const data: any = await invokeEdgeFunction('suggest-segments', { workspaceId: ws });
        setSuggestions((data?.suggestions ?? []) as Suggestion[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2">
            <Sparkles className="app-icon w-5 h-5 text-sky-600" />
            <div>
              <div className="font-semibold text-lg text-slate-900">AI Segment Suggestions</div>
              <div className="text-xs text-slate-500">Pick one to apply to your filters.</div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="app-icon w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : error ? (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
          ) : suggestions.length === 0 ? (
            <div className="text-sm text-slate-600">No suggestions available.</div>
          ) : (
            <div className="space-y-3">
              {suggestions.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => { onApply(s.segment); onClose(); }}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 hover:bg-slate-50"
                >
                  <div className="font-semibold text-slate-900">{s.title}</div>
                  <div className="text-sm text-slate-600 mt-1">{s.description}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


