import React, { useMemo, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  Plus,
  Eye,
  Save,
  Trash2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  X,
  Send,
  Type,
  Image as ImageIcon,
  RectangleHorizontal,
  Share2,
  Palette as PaletteIcon,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  Twitter,
} from 'lucide-react';
import type { Campaign, EmailBlock, EmailStyle } from '../types';
import { Select } from './ui/Select';

interface EmailBuilderViewProps {
  campaign: Campaign;
  onBack: () => void;
  onUpdate: (patch: Partial<Campaign>) => void;
}

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function defaultBlocks(name: string): EmailBlock[] {
  return [
    { id: makeId('blk'), type: 'header', text: name || 'Email Title' },
    { id: makeId('blk'), type: 'text', text: 'Write your email content here...' },
    { id: makeId('blk'), type: 'button', text: 'Call to Action', href: 'https://example.com' },
  ];
}

const DEFAULT_STYLE: EmailStyle = {
  primaryColor: '#0284c7',
  secondaryColor: '#0f172a',
  primaryFont: 'Inter',
  secondaryFont: 'Inter',
  textScale: 1,
};

function makeProductBlock(): EmailBlock {
  return {
    id: makeId('blk'),
    type: 'product',
    title: 'Featured Products',
    items: [
      { id: makeId('prd'), name: 'T‑Shirt', price: '$25', imageUrl: 'https://picsum.photos/seed/tshirt/300/240', url: 'https://example.com' },
      { id: makeId('prd'), name: 'Jeans', price: '$50', imageUrl: 'https://picsum.photos/seed/jeans/300/240', url: 'https://example.com' },
    ],
  };
}

function makeSocialBlock(): EmailBlock {
  return {
    id: makeId('blk'),
    type: 'social',
    items: [
      { id: makeId('soc'), network: 'Facebook', url: 'https://example.com' },
      { id: makeId('soc'), network: 'Instagram', url: 'https://example.com' },
      { id: makeId('soc'), network: 'LinkedIn', url: 'https://example.com' },
    ],
  };
}

const PALETTE: Array<{ label: string; icon: React.ComponentType<any>; make: () => EmailBlock }> = [
  { label: 'Text', icon: Type, make: () => ({ id: makeId('blk'), type: 'text', text: 'Your text goes here...' }) },
  { label: 'Image', icon: ImageIcon, make: () => ({ id: makeId('blk'), type: 'image', src: 'https://picsum.photos/900/360', alt: 'Image' }) },
  { label: 'Button', icon: RectangleHorizontal, make: () => ({ id: makeId('blk'), type: 'button', text: 'Shop Now', href: 'https://example.com' }) },
  { label: 'Product Block', icon: PaletteIcon, make: () => makeProductBlock() },
  { label: 'Divider', icon: MinusIconFallback, make: () => ({ id: makeId('blk'), type: 'divider' }) },
  { label: 'Social', icon: Share2, make: () => makeSocialBlock() },
];

// tiny fallback so we don't have to add another lucide icon import
function MinusIconFallback(props: { className?: string }) {
  return <span className={props.className}>—</span>;
}

export default function EmailBuilderView({ campaign, onBack, onUpdate }: EmailBuilderViewProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(campaign.emailBlocks?.[0]?.id ?? null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<'elements' | 'styles'>('elements');
  const [isTestSendOpen, setIsTestSendOpen] = useState(false);
  const [testEmail, setTestEmail] = useState('test@example.com');
  const [editingId, setEditingId] = useState<string | null>(null);

  const blocks = useMemo(() => (campaign.emailBlocks && campaign.emailBlocks.length > 0 ? campaign.emailBlocks : defaultBlocks(campaign.name)), [campaign.emailBlocks, campaign.name]);
  const selected = useMemo(() => blocks.find(b => b.id === selectedBlockId) ?? null, [blocks, selectedBlockId]);
  const style = campaign.emailStyle ?? DEFAULT_STYLE;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Avoid hijacking normal clicks; start dragging only after moving a bit.
      activationConstraint: { distance: 8 },
    }),
  );

  const ensureBlocks = () => {
    if (campaign.emailBlocks && campaign.emailBlocks.length > 0) return;
    onUpdate({ emailBlocks: blocks });
  };

  const ensureStyle = () => {
    if (campaign.emailStyle) return;
    onUpdate({ emailStyle: DEFAULT_STYLE });
  };

  const addBlock = (block: EmailBlock) => {
    ensureBlocks();
    ensureStyle();
    const next = [...blocks, block];
    onUpdate({ emailBlocks: next });
    setSelectedBlockId(block.id);
    setPanelTab('styles');
  };

  const insertBlockAt = (block: EmailBlock, index: number) => {
    ensureBlocks();
    ensureStyle();
    const idx = Math.max(0, Math.min(blocks.length, index));
    const next = blocks.slice();
    next.splice(idx, 0, block);
    onUpdate({ emailBlocks: next });
    setSelectedBlockId(block.id);
    setPanelTab('styles');
  };

  const deleteBlock = (id: string) => {
    const next = blocks.filter(b => b.id !== id);
    onUpdate({ emailBlocks: next });
    setSelectedBlockId(next[0]?.id ?? null);
  };

  const move = (id: string, dir: -1 | 1) => {
    const idx = blocks.findIndex(b => b.id === id);
    const nextIdx = idx + dir;
    if (idx < 0 || nextIdx < 0 || nextIdx >= blocks.length) return;
    const next = blocks.slice();
    const tmp = next[idx];
    next[idx] = next[nextIdx];
    next[nextIdx] = tmp;
    onUpdate({ emailBlocks: next });
  };

  const onCanvasDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('application/x-flowmail-block-id');
    const paletteLabel = e.dataTransfer.getData('application/x-flowmail-palette-label');

    // drop at end
    if (paletteLabel) {
      const item = PALETTE.find(p => p.label === paletteLabel);
      if (item) addBlock(item.make());
      return;
    }
    if (sourceId) {
      // dropping on empty canvas area = move to end
      const from = blocks.findIndex(b => b.id === sourceId);
      if (from >= 0) {
        const moving = blocks[from];
        const rest = blocks.filter(b => b.id !== sourceId);
        const next = [...rest, moving];
        onUpdate({ emailBlocks: next });
      }
    }
  };

  const patchBlock = (id: string, patch: Partial<EmailBlock>) => {
    const next = blocks.map(b => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b));
    onUpdate({ emailBlocks: next });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active?.id ?? '');
    const overId = String(e.over?.id ?? '');
    if (!activeId || !overId || activeId === overId) return;
    const oldIndex = blocks.findIndex(b => b.id === activeId);
    const newIndex = blocks.findIndex(b => b.id === overId);
    if (oldIndex < 0 || newIndex < 0) return;
    onUpdate({ emailBlocks: arrayMove(blocks, oldIndex, newIndex) });
  };

  const patchSelected = (patch: Partial<EmailBlock>) => {
    if (!selected) return;
    patchBlock(selected.id, patch);
  };

  const updateStyle = (patch: Partial<EmailStyle>) => {
    ensureStyle();
    onUpdate({ emailStyle: { ...style, ...patch } });
  };

  const fontFamily = style.primaryFont || 'Inter';
  const scale = Math.max(0.85, Math.min(1.15, style.textScale || 1));
  const emailVars: React.CSSProperties = {
    fontFamily,
    fontSize: `${Math.round(14 * scale)}px`,
    lineHeight: 1.55,
  };

  const renderBlockPreview = (b: EmailBlock) => {
    const isEditing = editingId === b.id;
    if (b.type === 'header') {
      if (isEditing) {
        return (
          <input
            autoFocus
            value={b.text}
            onChange={(e) => patchBlock(b.id, { text: e.target.value } as any)}
            onBlur={() => setEditingId(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') setEditingId(null);
            }}
            className="w-full bg-white text-slate-900 font-bold outline-none rounded-md border border-sky-200 px-2 py-1"
            style={{ fontFamily: style.secondaryFont || fontFamily }}
          />
        );
      }
      return <div className="text-xl font-bold text-slate-900" style={{ fontFamily: style.secondaryFont || fontFamily }}>{b.text}</div>;
    }
    if (b.type === 'text') {
      if (isEditing) {
        return (
          <textarea
            autoFocus
            value={b.text}
            onChange={(e) => patchBlock(b.id, { text: e.target.value } as any)}
            onBlur={() => setEditingId(null)}
            className="w-full h-32 bg-white text-slate-700 outline-none rounded-md border border-sky-200 px-2 py-1 resize-none"
          />
        );
      }
      return <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{b.text}</div>;
    }
    if (b.type === 'button') return (
      <a
        href={b.href}
        onClick={(e) => e.preventDefault()}
        className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-white text-sm font-semibold"
        style={{ background: style.primaryColor }}
      >
        {b.text}
      </a>
    );
    if (b.type === 'image') return (
      <img src={b.src} alt={b.alt ?? 'Image'} className="w-full rounded-lg border border-slate-200" />
    );
    if (b.type === 'product') {
      return (
        <div className="space-y-3">
          {b.title && <div className="text-sm font-semibold text-slate-900">{b.title}</div>}
          <div className="grid grid-cols-2 gap-3">
            {b.items.map((it) => (
              <a
                key={it.id}
                href={it.url || '#'}
                onClick={(e) => e.preventDefault()}
                className="block rounded-lg border border-slate-200 overflow-hidden hover:shadow-sm transition-shadow bg-white"
              >
                {it.imageUrl ? (
                  <img src={it.imageUrl} alt={it.name} className="w-full h-28 object-cover border-b border-slate-100" />
                ) : (
                  <div className="w-full h-28 bg-slate-100 border-b border-slate-100" />
                )}
                <div className="p-2">
                  <div className="text-xs font-semibold text-slate-900 truncate">{it.name}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{it.price}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      );
    }
    if (b.type === 'social') {
      const iconFor = (network: EmailBlock extends any ? any : never) => {
        switch (network) {
          case 'Facebook': return Facebook;
          case 'Instagram': return Instagram;
          case 'LinkedIn': return Linkedin;
          case 'YouTube': return Youtube;
          case 'X': return Twitter;
          default: return Share2;
        }
      };
      return (
        <div className="flex items-center justify-center gap-3">
          {b.items.map((it) => (
            <a
              key={it.id}
              href={it.url}
              onClick={(e) => e.preventDefault()}
              className="w-9 h-9 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-700 hover:bg-slate-50 transition-colors"
              title={it.network}
            >
              {(() => {
                const Icon = iconFor(it.network);
                return <Icon className="app-icon w-4 h-4" />;
              })()}
            </a>
          ))}
        </div>
      );
    }
    return <div className="w-full h-px bg-slate-200" />;
  };

  const SortableBlock: React.FC<{ b: EmailBlock }> = ({ b }) => {
    const isSelected = b.id === selectedBlockId;
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: b.id });
    const styleObj: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),
      transition,
    };
    return (
      <div
        ref={setNodeRef}
        style={styleObj}
        {...attributes}
        {...listeners}
        onClick={() => setSelectedBlockId(b.id)}
        onDoubleClick={() => {
          if (b.type === 'header' || b.type === 'text') {
            setSelectedBlockId(b.id);
            setEditingId(b.id);
          }
        }}
        className={`group relative rounded-lg border transition-colors p-3 cursor-grab active:cursor-grabbing select-none ${
          isSelected ? 'border-sky-300 bg-sky-50/30' : 'border-slate-200 hover:bg-slate-50'
        } ${isDragging ? 'opacity-70 ring-2 ring-sky-200' : ''}`}
      >
        <div className="absolute left-2 top-1/2 -translate-y-1/2 opacity-60 group-hover:opacity-100 transition-opacity">
          <div className="p-1 rounded-md hover:bg-slate-200 text-slate-500 icon-inherit" title="Drag to reorder">
            <GripVertical className="app-icon w-4 h-4" />
          </div>
        </div>

        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button onClick={(e) => { e.stopPropagation(); move(b.id, -1); }} className="p-1.5 rounded-md hover:bg-slate-200 text-slate-600 icon-inherit" title="Move up">
            <ChevronUp className="app-icon w-4 h-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); move(b.id, 1); }} className="p-1.5 rounded-md hover:bg-slate-200 text-slate-600 icon-inherit" title="Move down">
            <ChevronDown className="app-icon w-4 h-4" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); deleteBlock(b.id); }} className="p-1.5 rounded-md hover:bg-red-100 text-slate-600 hover:text-red-700 icon-inherit" title="Delete">
            <Trash2 className="app-icon w-4 h-4" />
          </button>
        </div>

        <div className="pl-6 pointer-events-none">
          {renderBlockPreview(b)}
        </div>
      </div>
    );
  };

  const renderBrandStyles = () => {
    const presets = ['#0284c7', '#0ea5e9', '#10b981', '#0f172a', '#111827'] as const;
    const fonts = ['Inter', 'Helvetica Neue', 'Arial', 'Georgia'] as const;
    return (
      <div className="space-y-6">
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Brand Colors</div>
          <div className="flex items-center gap-2">
            {presets.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => updateStyle({ primaryColor: c })}
                className={`w-7 h-7 rounded-md border ${style.primaryColor === c ? 'border-slate-900 ring-2 ring-sky-200' : 'border-slate-200'}`}
                style={{ background: c }}
                title={c}
              />
            ))}
            <input
              type="color"
              value={style.primaryColor}
              onChange={(e) => updateStyle({ primaryColor: e.target.value })}
              className="w-10 h-7 p-0 border border-slate-200 rounded-md bg-white"
              title="Custom color"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Font Settings</div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Primary Font</label>
            <Select<string>
              value={style.primaryFont}
              onChange={(v) => updateStyle({ primaryFont: v })}
              options={fonts.map((f) => ({ value: f, label: f }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Secondary Font</label>
            <Select<string>
              value={style.secondaryFont}
              onChange={(v) => updateStyle({ secondaryFont: v })}
              options={fonts.map((f) => ({ value: f, label: f }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">Text Size</label>
            <input
              type="range"
              min={0.85}
              max={1.15}
              step={0.01}
              value={style.textScale}
              onChange={(e) => updateStyle({ textScale: parseFloat(e.target.value) })}
              className="w-full accent-sky-600"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => {
    if (!selected) return <div className="text-sm text-slate-500">Select a block to edit.</div>;
    if (selected.type === 'divider') return <div className="text-sm text-slate-500">Divider has no settings.</div>;
    if (selected.type === 'header' || selected.type === 'text') {
      return (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Text</label>
          <textarea
            value={selected.text}
            onChange={(e) => patchSelected({ text: e.target.value } as any)}
            className="w-full h-40 bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none resize-none"
          />
        </div>
      );
    }
    if (selected.type === 'button') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Button Text</label>
            <input
              value={selected.text}
              onChange={(e) => patchSelected({ text: e.target.value } as any)}
              className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Link URL</label>
            <input
              value={selected.href}
              onChange={(e) => patchSelected({ href: e.target.value } as any)}
              className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </div>
        </div>
      );
    }
    if (selected.type === 'product') {
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
            <input
              value={selected.title ?? ''}
              onChange={(e) => patchSelected({ title: e.target.value } as any)}
              className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
            />
          </div>
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Items</div>
            {selected.items.map((it, idx) => (
              <div key={it.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-800">Item {idx + 1}</div>
                  <button
                    type="button"
                    className="text-xs text-red-700 hover:text-red-800"
                    onClick={() => {
                      const next = selected.items.filter(x => x.id !== it.id);
                      patchSelected({ items: next } as any);
                    }}
                  >
                    Remove
                  </button>
                </div>
                <input
                  value={it.name}
                  onChange={(e) => {
                    const next = selected.items.map(x => (x.id === it.id ? { ...x, name: e.target.value } : x));
                    patchSelected({ items: next } as any);
                  }}
                  className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                  placeholder="Name"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={it.price}
                    onChange={(e) => {
                      const next = selected.items.map(x => (x.id === it.id ? { ...x, price: e.target.value } : x));
                      patchSelected({ items: next } as any);
                    }}
                    className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                    placeholder="$0.00"
                  />
                  <input
                    value={it.url ?? ''}
                    onChange={(e) => {
                      const next = selected.items.map(x => (x.id === it.id ? { ...x, url: e.target.value } : x));
                      patchSelected({ items: next } as any);
                    }}
                    className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                    placeholder="URL"
                  />
                </div>
                <input
                  value={it.imageUrl ?? ''}
                  onChange={(e) => {
                    const next = selected.items.map(x => (x.id === it.id ? { ...x, imageUrl: e.target.value } : x));
                    patchSelected({ items: next } as any);
                  }}
                  className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                  placeholder="Image URL"
                />
              </div>
            ))}
            <button
              type="button"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium text-sm"
              onClick={() => {
                const next = [
                  ...selected.items,
                  { id: makeId('prd'), name: 'New Item', price: '$0', imageUrl: 'https://picsum.photos/seed/new/300/240', url: 'https://example.com' },
                ];
                patchSelected({ items: next } as any);
              }}
            >
              Add Item
            </button>
          </div>
        </div>
      );
    }
    if (selected.type === 'social') {
      const networks: Array<'Facebook' | 'Instagram' | 'X' | 'LinkedIn' | 'YouTube'> = ['Facebook', 'Instagram', 'X', 'LinkedIn', 'YouTube'];
      return (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Links</div>
          {selected.items.map((it) => (
            <div key={it.id} className="grid grid-cols-2 gap-2">
              <Select<'Facebook' | 'Instagram' | 'X' | 'LinkedIn' | 'YouTube'>
                value={it.network}
                onChange={(v) => {
                  const next = selected.items.map(x => (x.id === it.id ? { ...x, network: v } : x));
                  patchSelected({ items: next } as any);
                }}
                options={networks.map((n) => ({ value: n, label: n }))}
              />
              <input
                value={it.url}
                onChange={(e) => {
                  const next = selected.items.map(x => (x.id === it.id ? { ...x, url: e.target.value } : x));
                  patchSelected({ items: next } as any);
                }}
                className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-sky-500 outline-none"
                placeholder="https://..."
              />
            </div>
          ))}
          <button
            type="button"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium text-sm"
            onClick={() => patchSelected({ items: [...selected.items, { id: makeId('soc'), network: 'X', url: 'https://example.com' }] } as any)}
          >
            Add Social Link
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Image URL</label>
          <input
            value={selected.src}
            onChange={(e) => patchSelected({ src: e.target.value } as any)}
            className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Alt Text</label>
          <input
            value={selected.alt ?? ''}
            onChange={(e) => patchSelected({ alt: e.target.value } as any)}
            className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top action bar (pro builder style) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors" title="Back">
            <ArrowLeft className="app-icon w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="text-xs text-slate-500 font-medium">Drag-and-Drop Email Builder</div>
            <div className="text-base font-semibold text-slate-900 truncate">{campaign.name}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { ensureStyle(); onUpdate({ updatedAt: new Date().toISOString() }); }}
            className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 shadow-sm icon-on-solid"
          >
            <Save className="app-icon w-4 h-4" />
            Save
          </button>
          <button
            onClick={() => setIsPreviewOpen(true)}
            className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 icon-inherit"
          >
            <Eye className="app-icon w-4 h-4" />
            Preview
          </button>
          <button
            onClick={() => setIsTestSendOpen(true)}
            className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 icon-inherit"
          >
            <Send className="app-icon w-4 h-4" />
            Send Test
          </button>
          <button
            onClick={onBack}
            className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 icon-inherit"
          >
            <X className="app-icon w-4 h-4" />
            Close
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Canvas */}
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800">Canvas</h3>
            <div className="text-xs text-slate-500">Click blocks to edit • Drag to reorder</div>
          </div>

          <div
            className="rounded-lg bg-slate-50 border border-slate-200 p-6 max-w-3xl mx-auto"
            onDragOver={(e) => e.preventDefault()}
            onDrop={onCanvasDrop}
          >
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden" style={emailVars}>
              <div className="px-5 py-4 border-b border-slate-100">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Subject</label>
                <input
                  value={campaign.subject ?? ''}
                  onChange={(e) => onUpdate({ subject: e.target.value })}
                  placeholder="Subject line..."
                  className="w-full bg-transparent text-slate-900 font-semibold outline-none"
                  style={{ fontFamily: style.secondaryFont || fontFamily }}
                />
              </div>
              <div className="p-5 space-y-4">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                    {blocks.map((b) => (
                      <SortableBlock key={b.id} b={b} />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
              <div className="px-5 py-4 border-t border-slate-100 text-xs text-slate-500 flex justify-between">
                <span>Unsubscribe</span>
                <span>© {new Date().getFullYear()} FlowMail</span>
              </div>
            </div>
          </div>
        </div>

        {/* Builder & Styles */}
        <div className="xl:col-span-4 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="font-semibold text-slate-900">Builder & Styles</div>
            <button className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Close panel" onClick={() => setPanelTab('elements')}>
              <X className="app-icon w-4 h-4" />
            </button>
          </div>
          <div className="px-4 pt-3">
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setPanelTab('elements')}
                className={`py-2 rounded-md text-sm font-semibold ${panelTab === 'elements' ? 'bg-white border border-slate-200 text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Elements
              </button>
              <button
                type="button"
                onClick={() => setPanelTab('styles')}
                className={`py-2 rounded-md text-sm font-semibold ${panelTab === 'styles' ? 'bg-white border border-slate-200 text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Styles
              </button>
            </div>
          </div>

          <div className="p-4 space-y-6">
            {panelTab === 'elements' && (
              <div className="space-y-2">
                {PALETTE.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => addBlock(item.make())}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-flowmail-palette-label', item.label);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm text-slate-700"
                  >
                    <item.icon className="app-icon app-icon-muted w-4 h-4" />
                    <span className="flex-1 text-left">{item.label}</span>
                    <Plus className="app-icon app-icon-muted w-4 h-4" />
                  </button>
                ))}
              </div>
            )}

            {panelTab === 'styles' && (
              <>
                {renderBrandStyles()}
                <div className="pt-4 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Selected Block</div>
                  {renderSettings()}
                </div>
              </>
            )}

            {panelTab === 'elements' && (
              <>
                <div className="pt-4 border-t border-slate-100">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Selected Block</div>
                  {renderSettings()}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Send test modal */}
      {isTestSendOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="font-semibold text-slate-900">Send Test Email</div>
              <button onClick={() => setIsTestSendOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Close">
                <X className="app-icon w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block text-sm font-medium text-slate-700">Recipient</label>
              <input
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                placeholder="name@company.com"
              />
              <div className="text-xs text-slate-500">
                This is a simulated send (no email provider configured).
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 bg-white flex items-center justify-end gap-2">
              <button
                onClick={() => setIsTestSendOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setIsTestSendOpen(false);
                  window.alert(`Test email sent to ${testEmail} (simulated).`);
                }}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold icon-on-solid flex items-center gap-2"
              >
                <Send className="app-icon w-4 h-4" />
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {isPreviewOpen && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <div className="text-xs text-slate-500 font-medium">Preview</div>
                <div className="font-semibold text-slate-800">{campaign.subject || '(No subject)'}</div>
              </div>
              <button onClick={() => setIsPreviewOpen(false)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">
                Close
              </button>
            </div>
            <div className="p-6 overflow-y-auto bg-slate-50">
              <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4" style={emailVars}>
                {blocks.map(b => (
                  <div key={b.id}>{renderBlockPreview(b)}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


