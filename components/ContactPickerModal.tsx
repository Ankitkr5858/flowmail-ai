import React, { useMemo, useState } from 'react';
import { X, Search } from 'lucide-react';
import type { Contact } from '../types';

export default function ContactPickerModal({
  isOpen,
  onClose,
  contacts,
  selectedIds,
  onChange,
  title = 'Select recipients',
}: {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  selectedIds: string[];
  onChange: (nextSelectedIds: string[]) => void;
  title?: string;
}) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return contacts;
    return contacts.filter((c) => {
      const hay = [c.name, c.firstName, c.lastName, c.email].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [contacts, q]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selectedIds.includes(c.id));

  const toggleOne = (id: string) => {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  };

  const toggleAllFiltered = () => {
    if (allFilteredSelected) {
      onChange(selectedIds.filter((id) => !filtered.some((c) => c.id === id)));
    } else {
      const add = filtered.map((c) => c.id).filter((id) => !selectedIds.includes(id));
      onChange([...selectedIds, ...add]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[130] flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <div className="font-semibold text-lg text-slate-900">{title}</div>
            <div className="text-xs text-slate-500">Search and select contacts to receive this email.</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="app-icon w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 app-icon app-icon-muted w-4 h-4" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full bg-white text-slate-700 pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                placeholder="Search contacts…"
              />
            </div>
            <button
              type="button"
              onClick={toggleAllFiltered}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-semibold text-sm"
            >
              {allFilteredSelected ? 'Unselect filtered' : 'Select filtered'}
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="max-h-[50vh] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">No contacts match your search.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filtered.map((c) => {
                    const checked = selectedIds.includes(c.id);
                    return (
                      <li
                        key={c.id}
                        className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer"
                        onClick={() => toggleOne(c.id)}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(c.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-4"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">{c.name || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'Contact'}</div>
                          <div className="text-xs text-slate-500 truncate">{c.email}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between">
          <div className="text-sm text-slate-700">
            Selected: <span className="font-semibold">{selectedIds.length}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

