import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Filter, Download, UserPlus, MoreVertical, Check, ChevronDown, Upload, Sparkles } from 'lucide-react';
import type { Contact } from '../types';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Select } from './ui/Select';
import SegmentBuilderModal, { evaluateSegment, type SegmentDefinition } from './SegmentBuilderModal';
import SegmentSuggestionsModal from './SegmentSuggestionsModal';
import ConfirmDialog from './ConfirmDialog';

interface ContactsViewProps {
  contacts: Contact[];
  onCreate: () => void;
  onOpenContact: (id: string) => void;
  onEditContact: (id: string) => void;
  onDeleteContact: (id: string) => void;
  onDeleteSelectedContacts: (ids: string[]) => void;
  onImportCsv: (file: File) => void;
}

const ContactsView: React.FC<ContactsViewProps> = ({
  contacts,
  onCreate,
  onOpenContact,
  onEditContact,
  onDeleteContact,
  onDeleteSelectedContacts,
  onImportCsv,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [stageFilter, setStageFilter] = useState<'All' | 'cold' | 'lead' | 'mql' | 'customer' | 'churned'>('All');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<null | { id: string; top: number; left: number }>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSegOpen, setIsSegOpen] = useState(false);
  const [segment, setSegment] = useState<SegmentDefinition>({ logic: 'AND', conditions: [] });
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ title: string; description: string; confirmText: string } | null>(null);

  useEffect(() => {
    if (!openMenu) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      const triggerEl = target.closest('[data-contact-menu-trigger]');
      if (triggerEl?.getAttribute('data-contact-menu-trigger') === openMenu.id) return;
      setOpenMenu(null);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };

    const closeOnScrollOrResize = () => setOpenMenu(null);

    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', closeOnScrollOrResize, true);
    window.addEventListener('resize', closeOnScrollOrResize);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', closeOnScrollOrResize, true);
      window.removeEventListener('resize', closeOnScrollOrResize);
    };
  }, [openMenu]);

  const allSelected = contacts.length > 0 && selectedIds.length === contacts.length;
  const selectedCount = selectedIds.length;

  const handleDeleteSelected = () => {
    if (selectedCount === 0) return;
    const title = allSelected ? `Delete all ${selectedCount} contacts?` : `Delete ${selectedCount} selected contacts?`;
    setDeleteDialog({
      title,
      description: 'This action cannot be undone.',
      confirmText: allSelected ? 'Delete All' : 'Delete Selected',
    });
    setPendingDeleteIds(selectedIds);
    setOpenMenu(null);
  };

  const handleConfirmDelete = () => {
    if (!pendingDeleteIds || pendingDeleteIds.length === 0) return;
    if (pendingDeleteIds.length === 1) {
      onDeleteContact(pendingDeleteIds[0]);
    } else {
      onDeleteSelectedContacts(pendingDeleteIds);
    }
    setSelectedIds((prev) => prev.filter((id) => !pendingDeleteIds.includes(id)));
    setPendingDeleteIds(null);
    setDeleteDialog(null);
  };

  const handleCancelDelete = () => {
    setPendingDeleteIds(null);
    setDeleteDialog(null);
  };

  const handleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contacts.map(c => c.id));
    }
  };

  const handleSelectOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(selectedId => selectedId !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const filteredContacts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return contacts.filter(c => {
      const haystack = [
        c.name,
        c.firstName,
        c.lastName,
        c.email,
        ...(c.tags ?? []),
        ...(c.lists ?? []),
        c.company,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = !q || haystack.includes(q);
      const stage = String(c.lifecycleStage ?? '').toLowerCase();
      const normalizedStage =
        stage === 'lead' || stage === 'subscriber' ? 'lead' :
        stage === 'customer' ? 'customer' :
        stage === 'cold' ? 'cold' :
        stage === 'mql' ? 'mql' :
        stage === 'churned' ? 'churned' :
        stage === 'lead' ? 'lead' :
        stage;

      const matchesStage = stageFilter === 'All' || normalizedStage === stageFilter;
      const matchesSegment = evaluateSegment(c, segment);
      return matchesSearch && matchesStage && matchesSegment;
    });
  }, [contacts, searchTerm, stageFilter, segment]);

  const handleImportViaCsv = () => {
    setIsImportOpen(false);
    fileInputRef.current?.click();
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onImportCsv(file);
    e.target.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Contact List Management</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your audience and segmentation.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline">
            <Download className="app-icon w-4 h-4" />
            Export
          </Button>
          <Button variant="outline" onClick={() => setIsSuggestOpen(true)}>
            <Sparkles className="app-icon w-4 h-4" />
            AI Segments
          </Button>
          <div className="relative">
            <Button
              type="button"
              onClick={() => setIsImportOpen(v => !v)}
              variant="outline"
            >
              <Upload className="app-icon w-4 h-4" />
              Import Contacts
              <ChevronDown className="app-icon app-icon-muted w-4 h-4" />
            </Button>
            {isImportOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-20">
                <button onClick={handleImportViaCsv} className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 text-slate-700">
                  Import via CSV
                </button>
                <button disabled className="w-full text-left px-4 py-3 text-sm text-slate-400 bg-white cursor-not-allowed">
                  Import via API (coming soon)
                </button>
                <button disabled className="w-full text-left px-4 py-3 text-sm text-slate-400 bg-white cursor-not-allowed">
                  Import via Web Forms (coming soon)
                </button>
              </div>
            )}
          </div>
          <Button onClick={onCreate} variant="primary">
            <UserPlus className="app-icon w-4 h-4" />
            Create Contact
          </Button>
          {selectedCount > 0 && (
            <Button type="button" variant="outline" onClick={handleDeleteSelected} className="border-red-200 text-red-700 hover:bg-red-50">
              {allSelected ? `Delete All (${selectedCount})` : `Delete Selected (${selectedCount})`}
            </Button>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <Card className="p-4 flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 app-icon app-icon-muted w-4 h-4" />
          <input 
            type="text" 
            placeholder="Search by name, email, or tag..." 
            className="w-full bg-white pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-sm text-slate-700"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-3 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
          <button
            onClick={() => setIsSegOpen(true)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium flex items-center gap-2 whitespace-nowrap"
          >
            <Filter className="app-icon w-4 h-4" />
            Advanced Filters
          </button>
          <div className="min-w-[200px]">
            <Select<'All' | 'cold' | 'lead' | 'mql' | 'customer' | 'churned'>
              value={stageFilter}
              onChange={(v) => setStageFilter(v)}
              options={[
                { value: 'All', label: 'Lifecycle: All' },
                { value: 'cold', label: 'Lifecycle: cold' },
                { value: 'lead', label: 'Lifecycle: lead' },
                { value: 'mql', label: 'Lifecycle: mql' },
                { value: 'customer', label: 'Lifecycle: customer' },
                { value: 'churned', label: 'Lifecycle: churned' },
              ]}
              buttonClassName="px-3 py-2"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px] text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider w-10">
                  <div 
                    onClick={handleSelectAll}
                    className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${
                      allSelected 
                        ? 'bg-sky-600 border-sky-600' 
                        : 'bg-white border-slate-300'
                    }`}
                  >
                    {allSelected && <Check className="app-icon w-3 h-3 text-white" />}
                  </div>
                </th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">First Name</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Name</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Timezone</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Lifecycle</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Temperature</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tags</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Lists</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Acquisition</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Open</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Click</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Lead Score</th>
                <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredContacts.map((contact) => {
                const isSelected = selectedIds.includes(contact.id);
                const firstName = contact.firstName ?? contact.name.split(' ')[0] ?? '';
                const lastName = contact.lastName ?? contact.name.split(' ').slice(1).join(' ') ?? '';
                return (
                  <tr
                    key={contact.id}
                    onClick={() => onOpenContact(contact.id)}
                    className={`hover:bg-slate-50 transition-colors group cursor-pointer ${isSelected ? 'bg-sky-50/40' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div 
                        onClick={(e) => { e.stopPropagation(); handleSelectOne(contact.id); }}
                        className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-sky-600 border-sky-600' 
                            : 'bg-white border-slate-300'
                        }`}
                      >
                        {isSelected && <Check className="app-icon w-3 h-3 text-white" />}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-800 font-medium">{firstName}</td>
                    <td className="px-6 py-4 text-sm text-slate-800 font-medium">{lastName}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{contact.email}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{contact.phone || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{contact.timezone || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{contact.lifecycleStage || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      <Badge
                        variant={
                          String(contact.temperature).toLowerCase() === 'hot' ? 'danger' :
                          String(contact.temperature).toLowerCase() === 'warm' ? 'warning' :
                          String(contact.temperature).toLowerCase() === 'cold' ? 'default' :
                          'default'
                        }
                      >
                        {contact.temperature ? String(contact.temperature).toLowerCase() : '-'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(contact.tags || []).map(tag => (
                          <span key={tag} className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium border border-slate-200">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(contact.lists || []).map(list => (
                          <span key={list} className="px-2 py-0.5 rounded bg-sky-50 text-sky-800 text-[10px] font-medium border border-sky-200">
                            {list}
                          </span>
                        ))}
                        {(!contact.lists || contact.lists.length === 0) && <span className="text-sm text-slate-400">-</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{contact.acquisitionSource || '-'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {contact.lastOpenDate ? new Date(contact.lastOpenDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {contact.lastClickDate ? new Date(contact.lastClickDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-sky-600 rounded-full" style={{ width: `${Math.min(100, Math.max(0, contact.leadScore ?? 0))}%` }} />
                        </div>
                        <span className="text-sm font-semibold text-slate-700">{contact.leadScore ?? 0}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-block">
                        <button
                          data-contact-menu-trigger={contact.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            const triggerEl = e.currentTarget as HTMLElement | null;
                            if (!triggerEl) return;
                            setOpenMenu((cur) => {
                              if (cur?.id === contact.id) return null;

                              const rect = triggerEl.getBoundingClientRect();
                              const menuWidth = 160; // w-40
                              const menuHeight = 96; // 2 items + padding (approx)
                              const gap = 8;

                              const preferredLeft = rect.right - menuWidth;
                              const left = Math.min(Math.max(8, preferredLeft), window.innerWidth - menuWidth - 8);

                              const spaceBelow = window.innerHeight - rect.bottom;
                              const spaceAbove = rect.top;
                              const openUpwards = spaceBelow < menuHeight + gap && spaceAbove >= menuHeight + gap;
                              const preferredTop = openUpwards ? rect.top - menuHeight - gap : rect.bottom + gap;
                              const top = Math.min(Math.max(8, preferredTop), window.innerHeight - menuHeight - 8);

                              return { id: contact.id, top, left };
                            });
                          }}
                          className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-sky-700 transition-colors"
                          title="Actions"
                        >
                          <MoreVertical className="app-icon app-icon-muted w-4 h-4" />
                        </button>
                        {openMenu?.id === contact.id && typeof document !== 'undefined' && createPortal(
                          <div
                            ref={menuRef}
                            onClick={(e) => e.stopPropagation()}
                            style={{ position: 'fixed', top: openMenu.top, left: openMenu.left }}
                            className="w-40 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
                          >
                            <button
                              onClick={() => { setOpenMenu(null); onEditContact(contact.id); }}
                              className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 text-slate-700"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                setOpenMenu(null);
                                setDeleteDialog({
                                  title: 'Delete this contact?',
                                  description: 'This action cannot be undone.',
                                  confirmText: 'Delete',
                                });
                                setPendingDeleteIds([contact.id]);
                              }}
                              className="w-full text-left px-4 py-3 text-sm hover:bg-red-50 text-red-700"
                            >
                              Delete
                            </button>
                          </div>,
                          document.body
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredContacts.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            No contacts found matching your filters.
          </div>
        )}
      </Card>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFilePicked}
      />

      <SegmentBuilderModal
        isOpen={isSegOpen}
        onClose={() => setIsSegOpen(false)}
        value={segment}
        onChange={setSegment}
      />

      <SegmentSuggestionsModal
        isOpen={isSuggestOpen}
        onClose={() => setIsSuggestOpen(false)}
        onApply={(seg) => setSegment(seg)}
      />

      <ConfirmDialog
        isOpen={!!deleteDialog}
        title={deleteDialog?.title ?? 'Confirm action'}
        description={deleteDialog?.description}
        confirmText={deleteDialog?.confirmText ?? 'Confirm'}
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
};

export default ContactsView;
