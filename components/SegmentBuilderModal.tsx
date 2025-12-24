import React, { useMemo, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { Contact } from '../types';
import { Select } from './ui/Select';

export type SegmentLogic = 'AND' | 'OR';

export type SegmentCondition =
  | { id: string; field: 'lifecycleStage'; op: 'equals'; value: string }
  | { id: string; field: 'temperature'; op: 'equals'; value: string }
  | { id: string; field: 'status'; op: 'equals'; value: Contact['status'] }
  | { id: string; field: 'tag'; op: 'contains'; value: string }
  | { id: string; field: 'list'; op: 'contains'; value: string }
  | { id: string; field: 'leadScore'; op: '>=' | '<=' | '>' | '<'; value: number };

export type SegmentDefinition = {
  logic: SegmentLogic;
  conditions: SegmentCondition[];
};

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

export function evaluateSegment(contact: Contact, segment: SegmentDefinition): boolean {
  const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
  const stage = norm(contact.lifecycleStage);
  const temp = norm(contact.temperature);

  const evalCond = (c: SegmentCondition) => {
    if (c.field === 'lifecycleStage') return stage === norm(c.value);
    if (c.field === 'temperature') return temp === norm(c.value);
    if (c.field === 'status') return contact.status === c.value;
    if (c.field === 'tag') return (contact.tags ?? []).some(t => norm(t) === norm(c.value) || norm(t).includes(norm(c.value)));
    if (c.field === 'list') return (contact.lists ?? []).some(t => norm(t) === norm(c.value) || norm(t).includes(norm(c.value)));
    if (c.field === 'leadScore') {
      const s = typeof contact.leadScore === 'number' ? contact.leadScore : 0;
      if (c.op === '>=') return s >= c.value;
      if (c.op === '<=') return s <= c.value;
      if (c.op === '>') return s > c.value;
      return s < c.value;
    }
    return true;
  };

  if (segment.conditions.length === 0) return true;
  return segment.logic === 'AND'
    ? segment.conditions.every(evalCond)
    : segment.conditions.some(evalCond);
}

export default function SegmentBuilderModal({
  isOpen,
  onClose,
  value,
  onChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  value: SegmentDefinition;
  onChange: (next: SegmentDefinition) => void;
}) {
  const [local, setLocal] = useState<SegmentDefinition>(value);

  // refresh local copy when opened
  React.useEffect(() => {
    if (!isOpen) return;
    setLocal(value);
  }, [isOpen, value.logic, value.conditions.length]);

  const canApply = useMemo(() => true, []);

  if (!isOpen) return null;

  const update = (patch: Partial<SegmentDefinition>) => {
    setLocal(prev => ({ ...prev, ...patch }));
  };

  const addCondition = () => {
    const cond: SegmentCondition = { id: makeId('cond'), field: 'lifecycleStage', op: 'equals', value: 'lead' };
    update({ conditions: [...local.conditions, cond] });
  };

  const removeCondition = (id: string) => {
    update({ conditions: local.conditions.filter(c => c.id !== id) });
  };

  const patchCondition = (id: string, patch: Partial<SegmentCondition>) => {
    update({
      conditions: local.conditions.map(c => (c.id === id ? ({ ...c, ...patch } as any) : c)),
    });
  };

  const apply = () => {
    if (!canApply) return;
    onChange(local);
    onClose();
  };

  const fields = [
    { value: 'lifecycleStage', label: 'Lifecycle Stage' },
    { value: 'temperature', label: 'Temperature' },
    { value: 'status', label: 'Status' },
    { value: 'tag', label: 'Tag' },
    { value: 'list', label: 'List' },
    { value: 'leadScore', label: 'Lead Score' },
  ] as const;

  const lifecycleValues = [
    { value: 'cold', label: 'cold' },
    { value: 'lead', label: 'lead' },
    { value: 'mql', label: 'mql' },
    { value: 'customer', label: 'customer' },
    { value: 'churned', label: 'churned' },
  ];

  const tempValues = [
    { value: 'cold', label: 'cold' },
    { value: 'warm', label: 'warm' },
    { value: 'hot', label: 'hot' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <div className="text-lg font-semibold text-slate-900">Advanced Segmentation</div>
            <div className="text-xs text-slate-500">Build AND/OR conditions (client-side filtering for now).</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700">
            <X className="app-icon w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-slate-700">Match</div>
            <Select<SegmentLogic>
              value={local.logic}
              onChange={(v) => update({ logic: v })}
              options={[
                { value: 'AND', label: 'ALL conditions (AND)' },
                { value: 'OR', label: 'ANY condition (OR)' },
              ]}
            />
            <button
              type="button"
              className="ml-auto px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-semibold text-sm flex items-center gap-2"
              onClick={addCondition}
            >
              <Plus className="app-icon w-4 h-4" />
              Add condition
            </button>
          </div>

          <div className="space-y-3">
            {local.conditions.length === 0 && (
              <div className="text-sm text-slate-500">No conditions yet. Add one to start filtering.</div>
            )}

            {local.conditions.map((c) => {
              return (
                <div key={c.id} className="p-4 rounded-xl border border-slate-200 bg-white">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                    <div className="md:col-span-4">
                      <Select<any>
                        value={c.field}
                        onChange={(v) => {
                          if (v === 'leadScore') {
                            patchCondition(c.id, { field: 'leadScore', op: '>=', value: 50 } as any);
                          } else if (v === 'status') {
                            patchCondition(c.id, { field: 'status', op: 'equals', value: 'Subscribed' } as any);
                          } else if (v === 'tag') {
                            patchCondition(c.id, { field: 'tag', op: 'contains', value: '' } as any);
                          } else if (v === 'list') {
                            patchCondition(c.id, { field: 'list', op: 'contains', value: '' } as any);
                          } else if (v === 'temperature') {
                            patchCondition(c.id, { field: 'temperature', op: 'equals', value: 'warm' } as any);
                          } else {
                            patchCondition(c.id, { field: 'lifecycleStage', op: 'equals', value: 'lead' } as any);
                          }
                        }}
                        options={fields as any}
                      />
                    </div>

                    <div className="md:col-span-3">
                      {c.field === 'leadScore' ? (
                        <Select<any>
                          value={c.op}
                          onChange={(v) => patchCondition(c.id, { op: v } as any)}
                          options={[
                            { value: '>=', label: '>=' },
                            { value: '<=', label: '<=' },
                            { value: '>', label: '>' },
                            { value: '<', label: '<' },
                          ]}
                        />
                      ) : (
                        <Select<any>
                          value={c.op}
                          onChange={(v) => patchCondition(c.id, { op: v } as any)}
                          options={[{ value: 'equals', label: 'equals' }, { value: 'contains', label: 'contains' }].filter((o) =>
                            c.field === 'tag' || c.field === 'list' ? o.value === 'contains' : o.value === 'equals'
                          )}
                        />
                      )}
                    </div>

                    <div className="md:col-span-4">
                      {c.field === 'lifecycleStage' && (
                        <Select<string>
                          value={String(c.value)}
                          onChange={(v) => patchCondition(c.id, { value: v } as any)}
                          options={lifecycleValues}
                        />
                      )}
                      {c.field === 'temperature' && (
                        <Select<string>
                          value={String(c.value)}
                          onChange={(v) => patchCondition(c.id, { value: v } as any)}
                          options={tempValues}
                        />
                      )}
                      {c.field === 'status' && (
                        <Select<Contact['status']>
                          value={c.value as any}
                          onChange={(v) => patchCondition(c.id, { value: v } as any)}
                          options={[
                            { value: 'Subscribed', label: 'Subscribed' },
                            { value: 'Unsubscribed', label: 'Unsubscribed' },
                            { value: 'Bounced', label: 'Bounced' },
                          ]}
                        />
                      )}
                      {(c.field === 'tag' || c.field === 'list') && (
                        <input
                          value={String((c as any).value ?? '')}
                          onChange={(e) => patchCondition(c.id, { value: e.target.value } as any)}
                          className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                          placeholder={c.field === 'tag' ? 'e.g. webinar_signup' : 'e.g. newsletter'}
                        />
                      )}
                      {c.field === 'leadScore' && (
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={Number((c as any).value ?? 0)}
                          onChange={(e) => patchCondition(c.id, { value: Number(e.target.value) } as any)}
                          className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                        />
                      )}
                    </div>

                    <div className="md:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeCondition(c.id)}
                        className="p-2 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-700"
                        title="Remove"
                      >
                        <Trash2 className="app-icon w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold">
            Cancel
          </button>
          <button
            onClick={apply}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}


