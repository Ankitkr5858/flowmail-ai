import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Play,
  Pause,
  Trash2,
  Settings2,
  ZoomIn,
  ZoomOut,
  LocateFixed,
  Mail,
  Clock,
  GitBranch,
  SlidersHorizontal,
  Save,
  X,
  Eye,
} from 'lucide-react';
import type { Automation, AutomationStep, AutomationStepType } from '../types';
import { Select } from './ui/Select';
import { invokeEdgeFunction } from '../services/edgeFunctions';
import { getSupabase, getWorkspaceId, isSupabaseConfigured } from '../services/supabase';
import { useAppStore } from '../store/AppStore';
import AlertDialog from './AlertDialog';
import AutomationRunsModal from './AutomationRunsModal';

interface AutomationBuilderViewProps {
  automation: Automation;
  onBack: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<Automation>) => void;
}

type StepTemplate =
  | { kind: 'trigger.form_submitted'; title: string }
  | { kind: 'trigger.email_open'; title: string }
  | { kind: 'trigger.link_click'; title: string }
  | { kind: 'trigger.tag_added'; title: string }
  | { kind: 'trigger.tag_removed'; title: string }
  | { kind: 'trigger.list_joined'; title: string }
  | { kind: 'trigger.list_left'; title: string }
  | { kind: 'trigger.page_visited'; title: string }
  | { kind: 'trigger.purchase'; title: string }
  | { kind: 'trigger.purchase_upgraded'; title: string }
  | { kind: 'trigger.purchase_cancelled'; title: string }
  | { kind: 'condition.lead_score'; title: string }
  | { kind: 'condition.lifecycle_stage'; title: string }
  | { kind: 'condition.last_open_days'; title: string }
  | { kind: 'condition.has_tag'; title: string }
  | { kind: 'action.send_email'; title: string }
  | { kind: 'action.update_field'; title: string }
  | { kind: 'action.notify'; title: string }
  | { kind: 'wait'; title: string };

const STEP_GROUPS: Array<{
  title: string;
  icon: React.ComponentType<any>;
  items: Array<{ type: AutomationStepType; template: StepTemplate }>;
}> = [
  {
    title: 'Triggers',
    icon: GitBranch,
    items: [
      { type: 'trigger', template: { kind: 'trigger.form_submitted', title: 'Form Submitted' } },
      { type: 'trigger', template: { kind: 'trigger.email_open', title: 'Email Open' } },
      { type: 'trigger', template: { kind: 'trigger.link_click', title: 'Email Click' } },
      { type: 'trigger', template: { kind: 'trigger.tag_added', title: 'Tag Added' } },
      { type: 'trigger', template: { kind: 'trigger.tag_removed', title: 'Tag Removed' } },
      { type: 'trigger', template: { kind: 'trigger.list_joined', title: 'List Joined' } },
      { type: 'trigger', template: { kind: 'trigger.list_left', title: 'List Left' } },
      { type: 'trigger', template: { kind: 'trigger.page_visited', title: 'Page Visited' } },
      { type: 'trigger', template: { kind: 'trigger.purchase', title: 'Purchase Made' } },
      { type: 'trigger', template: { kind: 'trigger.purchase_upgraded', title: 'Purchase Upgraded' } },
      { type: 'trigger', template: { kind: 'trigger.purchase_cancelled', title: 'Purchase Cancelled' } },
    ],
  },
  {
    title: 'Conditions',
    icon: SlidersHorizontal,
    items: [
      { type: 'condition', template: { kind: 'condition.lead_score', title: 'Check: Lead Score > 50' } },
      { type: 'condition', template: { kind: 'condition.lifecycle_stage', title: 'Check: Lifecycle Stage' } },
      { type: 'condition', template: { kind: 'condition.last_open_days', title: 'Check: Last Open > N days' } },
      { type: 'condition', template: { kind: 'condition.has_tag', title: 'Check: Has Tag' } },
    ],
  },
  {
    title: 'Actions',
    icon: Mail,
    items: [
      { type: 'action', template: { kind: 'action.send_email', title: 'Send Email' } },
      { type: 'action', template: { kind: 'action.update_field', title: 'Update Field' } },
      { type: 'action', template: { kind: 'action.notify', title: 'Notify Team' } },
    ],
  },
  {
    title: 'Wait',
    icon: Clock,
    items: [{ type: 'wait', template: { kind: 'wait', title: 'Wait 1 day' } }],
  },
];

const PREBUILT_RECIPES: Array<{ title: string; description: string; steps: AutomationStep[] }> = [
  {
    title: 'New Subscriber Onboarding',
    description: 'Welcome email + follow up after 1 day.',
    steps: [
      { id: 'r1_start', type: 'trigger', title: 'Form Submitted: Newsletter Signup', config: { kind: 'trigger.form_submitted', form: 'Newsletter Signup' } },
      { id: 'r1_email1', type: 'action', title: 'Send Email: Welcome Packet', config: { kind: 'action.send_email', template: 'Welcome V3', subject: 'Welcome to the community!', body: 'Hi {{firstName}},\n\nWelcome! Here’s what to expect…' } },
      { id: 'r1_wait', type: 'wait', title: 'Wait: 1 day', config: { kind: 'wait', days: 1 } },
      { id: 'r1_email2', type: 'action', title: 'Send Email: Follow-up', config: { kind: 'action.send_email', template: 'Follow-up', subject: 'Quick follow-up', body: 'Just checking in—any questions?' } },
    ],
  },
  {
    title: 'Lead Qualification',
    description: 'Route based on lead score, then send tailored email.',
    steps: [
      { id: 'r2_start', type: 'trigger', title: 'Form Submitted: Demo Request', config: { kind: 'trigger.form_submitted', form: 'Demo Request' } },
      { id: 'r2_check', type: 'condition', title: 'Check: Lead Score > 50', config: { kind: 'condition.lead_score', op: '>', value: 50 } },
      { id: 'r2_yes', type: 'action', title: 'Send Email: Book a Call', config: { kind: 'action.send_email', template: 'Sales', subject: 'Let’s book a call', body: 'Pick a time that works for you…' } },
      { id: 'r2_wait', type: 'wait', title: 'Wait: 1 day', config: { kind: 'wait', days: 1 } },
      { id: 'r2_no', type: 'action', title: 'Send Email: Learn More', config: { kind: 'action.send_email', template: 'Nurture', subject: 'A few resources to get started', body: 'Here are 3 short reads…' } },
    ],
  },
];

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

const AutomationBuilderView: React.FC<AutomationBuilderViewProps> = ({ automation, onBack, onToggleStatus, onDelete, onUpdate }) => {
  const steps = automation.steps ?? [];
  const [selectedStepId, setSelectedStepId] = useState<string | null>(steps[0]?.id ?? null);
  const [zoom, setZoom] = useState(1);
  const [isEmailPreviewOpen, setIsEmailPreviewOpen] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragPos, setDragPos] = useState<{ stepId: string; x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const dragRef = useRef<{
    stepId: string;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    latestX?: number;
    latestY?: number;
  } | null>(null);

  const selectedStep = useMemo(() => steps.find(s => s.id === selectedStepId) ?? null, [steps, selectedStepId]);
  const { state } = useAppStore();
  const contacts = state.contacts ?? [];
  const [isTestOpen, setIsTestOpen] = useState(false);
  const [testContactId, setTestContactId] = useState<string>('');
  const [testBusy, setTestBusy] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const [focusRunId, setFocusRunId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ title: string; message: string } | null>(null);

  const addStep = (type: AutomationStepType, template: StepTemplate) => {
    const baseConfig =
      template.kind === 'action.send_email'
        ? { kind: 'action.send_email', template: 'Welcome V3', subject: 'Welcome to the community!', body: 'Hi {{firstName}},\n\nWelcome aboard!' }
        : template.kind === 'wait'
          ? { kind: 'wait', days: 1 }
          : { kind: template.kind };

    const newStep: AutomationStep = { id: makeId('step'), type, title: template.title, config: baseConfig };
    const nextSteps = [...steps, newStep];
    onUpdate({ steps: nextSteps, lastActivityAt: new Date().toISOString() });
    setSelectedStepId(newStep.id);
  };

  const deleteStep = (id: string) => {
    const nextSteps = steps.filter(s => s.id !== id);
    onUpdate({ steps: nextSteps, lastActivityAt: new Date().toISOString() });
    if (selectedStepId === id) setSelectedStepId(nextSteps[0]?.id ?? null);
  };

  const renameAutomation = (name: string) => {
    onUpdate({ name });
  };

  const updateSelectedTitle = (title: string) => {
    if (!selectedStep) return;
    onUpdate({ steps: steps.map(s => (s.id === selectedStep.id ? { ...s, title } : s)) });
  };

  const updateSelectedConfig = (patch: Record<string, unknown>) => {
    if (!selectedStep) return;
    onUpdate({
      steps: steps.map(s => (s.id === selectedStep.id ? { ...s, config: { ...(s.config ?? {}), ...patch } } : s)),
    });
  };

  const applyRecipe = (recipeSteps: AutomationStep[]) => {
    const stamped = recipeSteps.map(s => ({ ...s, id: makeId('step') }));
    onUpdate({ steps: stamped, lastActivityAt: new Date().toISOString() });
    setSelectedStepId(stamped[0]?.id ?? null);
  };

  const saveNow = () => onUpdate({ updatedAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() });

  const zoomPct = Math.round(zoom * 100);
  const clampZoom = (z: number) => Math.max(0.5, Math.min(1.6, z));

  const getPos = (s: AutomationStep) => {
    if (dragPos && dragPos.stepId === s.id) return { x: dragPos.x, y: dragPos.y };
    const cfg = (s.config ?? {}) as any;
    const x = Number(cfg.x);
    const y = Number(cfg.y);
    return {
      x: Number.isFinite(x) ? x : 420,
      y: Number.isFinite(y) ? y : 80,
    };
  };

  const setPos = (id: string, x: number, y: number) => {
    onUpdate({
      steps: steps.map(s => (s.id === id ? { ...s, config: { ...(s.config ?? {}), x, y } } : s)),
      lastActivityAt: new Date().toISOString(),
    });
  };

  const nodes = useMemo(() => {
    const w = 280;
    const h = 72;
    // if no positions exist, do a default vertical layout
    const hasAnyPos = steps.some(s => {
      const cfg = (s.config ?? {}) as any;
      return Number.isFinite(Number(cfg.x)) && Number.isFinite(Number(cfg.y));
    });
    if (!hasAnyPos) {
      const startX = 420;
      const startY = 60;
      const gapY = 120;
      return steps.map((s, idx) => ({ step: s, ...{ x: startX, y: startY + idx * gapY, w, h } }));
    }
    return steps.map(s => {
      const p = getPos(s);
      return { step: s, x: p.x, y: p.y, w, h };
    });
  }, [steps, dragPos]);

  const stepById = useMemo(() => {
    const m = new Map<string, AutomationStep>();
    steps.forEach(s => m.set(s.id, s));
    return m;
  }, [steps]);

  const edges = useMemo(() => {
    type Edge = { from: string; to: string; label?: 'Yes' | 'No' };
    const out: Edge[] = [];
    for (const s of steps) {
      const cfg = (s.config ?? {}) as any;
      if (s.type === 'condition') {
        const yes = typeof cfg.nextYes === 'string' ? cfg.nextYes : null;
        const no = typeof cfg.nextNo === 'string' ? cfg.nextNo : null;
        if (yes && stepById.has(yes)) out.push({ from: s.id, to: yes, label: 'Yes' });
        if (no && stepById.has(no)) out.push({ from: s.id, to: no, label: 'No' });
      } else {
        const next = typeof cfg.next === 'string' ? cfg.next : null;
        if (next && stepById.has(next)) out.push({ from: s.id, to: next });
      }
    }
    return out;
  }, [steps, stepById]);

  const upsertLink = (fromId: string, patch: Record<string, unknown>) => {
    onUpdate({
      steps: steps.map(s => (s.id === fromId ? { ...s, config: { ...(s.config ?? {}), ...patch } } : s)),
      lastActivityAt: new Date().toISOString(),
    });
  };

  const addStepLinked = (fromId: string, type: AutomationStepType, template: StepTemplate, linkKind?: 'next' | 'nextYes' | 'nextNo') => {
    const baseConfig =
      template.kind === 'action.send_email'
        ? { kind: 'action.send_email', template: 'Welcome V3', subject: 'Welcome to the community!', body: 'Hi {{firstName}},\n\nWelcome aboard!' }
        : template.kind === 'wait'
          ? { kind: 'wait', days: 1 }
          : { kind: template.kind };

    const id = makeId('step');
    const from = stepById.get(fromId);
    const fromPos = from ? getPos(from) : { x: 420, y: 80 };
    const newPos = { x: fromPos.x + 340, y: fromPos.y + 140 };
    const newStep: AutomationStep = { id, type, title: template.title, config: { ...baseConfig, x: newPos.x, y: newPos.y } };

    const nextSteps = [...steps, newStep];
    // wire link
    const key = linkKind ?? (from?.type === 'condition' ? 'nextYes' : 'next');
    const patched = nextSteps.map(s => {
      if (s.id !== fromId) return s;
      return { ...s, config: { ...(s.config ?? {}), [key]: id } };
    });

    onUpdate({ steps: patched, lastActivityAt: new Date().toISOString() });
    setSelectedStepId(id);
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragRef.current) {
        const { stepId, offsetX, offsetY } = dragRef.current;
        // adjust for zoom
        const x = (e.clientX - offsetX - pan.x) / zoom;
        const y = (e.clientY - offsetY - pan.y) / zoom;
        const nx = Math.round(x);
        const ny = Math.round(y);
        dragRef.current.latestX = nx;
        dragRef.current.latestY = ny;
        setDragPos({ stepId, x: nx, y: ny });
      } else if (isPanning && panStartRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setPan({ x: panStartRef.current.panX + dx, y: panStartRef.current.panY + dy });
      }
    };
    const onUp = () => {
      // Commit node position once (avoids storage/network races that can cause "jumping")
      if (dragRef.current) {
        const { stepId, latestX, latestY, startX, startY } = dragRef.current;
        const cx = Number.isFinite(Number(latestX)) ? Number(latestX) : startX;
        const cy = Number.isFinite(Number(latestY)) ? Number(latestY) : startY;
        setPos(stepId, cx, cy);
      }
      dragRef.current = null;
      setDragPos(null);
      setIsPanning(false);
      panStartRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isPanning, pan.x, pan.y, zoom]);

  useEffect(() => {
    if (!isTestOpen) return;
    if (testContactId) return;
    // Default to the first contact to make "Test run" one click.
    const first = contacts[0]?.id;
    if (first) setTestContactId(String(first));
  }, [isTestOpen, testContactId, contacts]);

  const runTest = async () => {
    if (!isSupabaseConfigured()) {
      setAlert({
        title: 'Supabase not configured',
        message: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then sign in.',
      });
      return;
    }
    const cid = String(testContactId ?? '').trim();
    if (!cid) {
      setAlert({ title: 'Pick a contact', message: 'Select a contact to run this automation against.' });
      return;
    }
    setTestBusy(true);
    try {
      const sb = getSupabase();
      const ws =
        sb
          ? (await sb.auth.getSession().then(({ data }) => data.session?.user?.id).catch(() => null)) || getWorkspaceId() || 'default'
          : getWorkspaceId() || 'default';
      const triggerRes: any = await invokeEdgeFunction('automation-trigger', {
        workspaceId: ws,
        automationId: automation.id,
        contactId: cid,
      });
      const workerRes: any = await invokeEdgeFunction('automation-worker', { workspaceId: ws, batch: 25 });
      setIsTestOpen(false);
      setFocusRunId(String(triggerRes?.runId ?? '') || null);
      setRunsOpen(true);
      setAlert({
        title: 'Test run started',
        message:
          `Run created: ${String(triggerRes?.runId ?? '(unknown)')}\n` +
          `Queue processed: ${String(workerRes?.processed ?? 0)} item(s)\n\n` +
          `Open "Runs" to see status. If you have a Send Email step, it will enqueue an email in email_sends (delivery requires your SMTP gateway).`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAlert({ title: 'Test failed', message: msg });
    } finally {
      setTestBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors" title="Back">
            <ArrowLeft className="app-icon w-5 h-5" />
          </button>
          <div className="min-w-0">
            <div className="text-xs text-slate-500 font-medium">Automation Builder</div>
            <input
              value={automation.name}
              onChange={(e) => renameAutomation(e.target.value)}
              className="text-base font-semibold text-slate-900 bg-transparent outline-none border-b border-transparent focus:border-sky-300 w-full sm:w-[520px] max-w-full"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={saveNow}
            className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 shadow-sm icon-on-solid"
          >
            <Save className="app-icon w-4 h-4" />
            Save
          </button>
          <button
            onClick={() => setRunsOpen(true)}
            className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 icon-inherit"
            title="View automation runs"
          >
            <Eye className="app-icon w-4 h-4" />
            Runs
          </button>
          <button
            onClick={() => {
              if (!contacts.length) {
                setAlert({
                  title: 'No contacts yet',
                  message: 'Create at least one contact (Contacts → New Contact), then come back and run a test.',
                });
                return;
              }
              setIsTestOpen(true);
            }}
            className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 icon-inherit"
            title="Create a run and process the queue once (quick smoke test)"
          >
            <Play className="app-icon w-4 h-4" />
            Test Run
          </button>
          <button
            onClick={onToggleStatus}
            className={`px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 shadow-sm transition-colors ${
              automation.status === 'Running' ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            } icon-on-solid`}
          >
            {automation.status === 'Running' ? <Pause className="app-icon w-4 h-4" /> : <Play className="app-icon w-4 h-4" />}
            {automation.status === 'Running' ? 'Pause' : 'Run'}
          </button>
          <button
            onClick={onBack}
            className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 icon-inherit"
          >
            <X className="app-icon w-4 h-4" />
            Exit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left palette */}
        <div className="xl:col-span-3 bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <h3 className="font-semibold text-slate-800 mb-4">Triggers / Actions</h3>
          <div className="space-y-4">
            {STEP_GROUPS.map(group => (
              <div key={group.title}>
                <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">{group.title}</div>
                <div className="space-y-2">
                  {group.items.map(item => (
                    <button
                      key={`${group.title}-${item.template.kind}-${item.template.title}`}
                      onClick={() => addStep(item.type, item.template)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm text-slate-700"
                    >
                      <span>{item.template.title}</span>
                      <Plus className="app-icon app-icon-muted w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="xl:col-span-6 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Workflow</h3>
            <div className="flex items-center gap-2">
              <div className="text-xs text-slate-500 mr-2">{zoomPct}%</div>
              <button
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                title="Zoom out"
                onClick={() => setZoom(z => clampZoom(z - 0.1))}
              >
                <ZoomOut className="app-icon w-4 h-4" />
              </button>
              <button
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                title="Zoom in"
                onClick={() => setZoom(z => clampZoom(z + 0.1))}
              >
                <ZoomIn className="app-icon w-4 h-4" />
              </button>
              <button
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                title="Reset zoom"
                onClick={() => setZoom(1)}
              >
                <LocateFixed className="app-icon w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="relative h-[520px] bg-slate-50">
            {/* grid */}
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.06) 1px, transparent 1px)',
                backgroundSize: '26px 26px',
              }}
            />

            <div
              className="absolute inset-0 overflow-hidden"
              onMouseDown={(e) => {
                if ((e.target as HTMLElement).closest('[data-node="1"]')) return;
                setIsPanning(true);
                panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
              }}
            >
              <div
                className="relative"
                style={{
                  width: 900,
                  height: Math.max(560, nodes.length * 140),
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'top left',
                }}
              >
                {/* Edges */}
                <svg className="absolute inset-0" width="100%" height="100%">
                  {edges.map((e, idx) => {
                    const from = nodes.find(n => n.step.id === e.from);
                    const to = nodes.find(n => n.step.id === e.to);
                    if (!from || !to) return null;
                    const x1 = from.x + from.w;
                    const y1 = from.y + from.h / 2;
                    const x2 = to.x;
                    const y2 = to.y + to.h / 2;
                    const mx = (x1 + x2) / 2;
                    const path = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
                    return (
                      <g key={idx}>
                        <path d={path} stroke="rgba(15,23,42,0.35)" strokeWidth="2" fill="none" />
                        <circle cx={x2} cy={y2} r="4" fill="rgba(2,132,199,0.9)" />
                        {e.label && (
                          <g>
                            <rect x={mx - 16} y={(y1 + y2) / 2 - 10} width="32" height="20" rx="10" fill="white" stroke="rgba(15,23,42,0.12)" />
                            <text x={mx} y={(y1 + y2) / 2 + 4} textAnchor="middle" fontSize="11" fill="#0b1220" fontWeight="600">
                              {e.label}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {nodes.map((n, idx) => {
                  const s = n.step;
                  const isSelected = s.id === selectedStepId;
                  const pill =
                    s.type === 'trigger'
                      ? 'bg-emerald-100 text-emerald-800'
                      : s.type === 'condition'
                        ? 'bg-amber-100 text-amber-800'
                        : s.type === 'action'
                          ? 'bg-sky-100 text-sky-900'
                          : 'bg-slate-200 text-slate-800';

                  return (
                    <React.Fragment key={s.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Select step: ${s.title}`}
                        onClick={() => setSelectedStepId(s.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setSelectedStepId(s.id);
                        }}
                        className={`absolute text-left rounded-xl border shadow-sm bg-white px-4 py-3 transition-colors cursor-grab select-none ${
                          isSelected ? 'border-sky-300 ring-2 ring-sky-100' : 'border-slate-200 hover:border-slate-300'
                        }`}
                        style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
                        data-node="1"
                        onMouseDown={(e) => {
                          // Select immediately so Step Settings doesn't "disappear" when the user drags slightly.
                          setSelectedStepId(s.id);
                          // start drag (left button only)
                          if (e.button !== 0) return;
                          e.preventDefault();
                          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                          dragRef.current = {
                            stepId: s.id,
                            offsetX: e.clientX - rect.left,
                            offsetY: e.clientY - rect.top,
                            startX: n.x,
                            startY: n.y,
                          };
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">{s.title}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{s.type}</div>
                          </div>
                          <div className={`px-2 py-1 rounded-md text-[11px] font-semibold ${pill}`}>
                            {s.type === 'trigger' ? 'Trigger' : s.type === 'condition' ? 'Condition' : s.type === 'action' ? 'Action' : 'Wait'}
                          </div>
                        </div>
                        <div className="absolute -right-3 top-1/2 -translate-y-1/2 opacity-0 hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteStep(s.id); }}
                            className="p-2 rounded-lg bg-white border border-slate-200 shadow-sm hover:bg-red-50 text-slate-500 hover:text-red-700 icon-inherit"
                            title="Remove"
                          >
                            <Trash2 className="app-icon w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}

                {nodes.length === 0 && (
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                    <div className="text-slate-700 font-semibold">Start building your automation</div>
                    <div className="text-sm text-slate-500 mt-1">Add a trigger from the left panel.</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Prebuilt recipes */}
          <div className="border-t border-slate-100 p-4 bg-white">
            <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-3">Prebuilt Recipes</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PREBUILT_RECIPES.map((r) => (
                <button
                  key={r.title}
                  onClick={() => applyRecipe(r.steps)}
                  className="text-left p-4 rounded-xl border border-slate-200 hover:bg-slate-50"
                >
                  <div className="font-semibold text-slate-900">{r.title}</div>
                  <div className="text-sm text-slate-600 mt-1">{r.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right config */}
        <div className="xl:col-span-3 bg-white border border-slate-200 rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="app-icon app-icon-muted w-4 h-4" />
            <h3 className="font-semibold text-slate-800">Step Settings</h3>
          </div>

          {!selectedStep ? (
            <div className="text-sm text-slate-500">Select a step to edit its settings.</div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input
                  value={selectedStep.title}
                  onChange={(e) => updateSelectedTitle(e.target.value)}
                  className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                />
              </div>
              {selectedStep.type === 'wait' && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Wait (days)</label>
                  <input
                    type="number"
                    min={0}
                    value={Number((selectedStep.config as any)?.days ?? 1)}
                    onChange={(e) => updateSelectedConfig({ days: Number(e.target.value) })}
                    className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                </div>
              )}

              {selectedStep.type === 'trigger' && (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-900">Trigger settings</div>
                  {String((selectedStep.config as any)?.kind ?? '') === 'trigger.form_submitted' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Form name</label>
                      <input
                        value={String((selectedStep.config as any)?.form ?? '')}
                        onChange={(e) => updateSelectedConfig({ form: e.target.value })}
                        className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                        placeholder="Newsletter Signup"
                      />
                    </div>
                  )}
                  {String((selectedStep.config as any)?.kind ?? '') === 'trigger.email_open' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Campaign ID (optional)</label>
                      <input
                        value={String((selectedStep.config as any)?.campaignId ?? '')}
                        onChange={(e) => updateSelectedConfig({ campaignId: e.target.value })}
                        className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                        placeholder="(leave empty for any campaign)"
                      />
                    </div>
                  )}
                  {String((selectedStep.config as any)?.kind ?? '') === 'trigger.link_click' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Campaign ID (optional)</label>
                        <input
                          value={String((selectedStep.config as any)?.campaignId ?? '')}
                          onChange={(e) => updateSelectedConfig({ campaignId: e.target.value })}
                          className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                          placeholder="(leave empty for any campaign)"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">URL contains (optional)</label>
                        <input
                          value={String((selectedStep.config as any)?.urlContains ?? '')}
                          onChange={(e) => updateSelectedConfig({ urlContains: e.target.value })}
                          className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                          placeholder="pricing"
                        />
                      </div>
                    </>
                  )}
                  {(String((selectedStep.config as any)?.kind ?? '') === 'trigger.tag_added' || String((selectedStep.config as any)?.kind ?? '') === 'trigger.tag_removed') && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tag (optional)</label>
                      <input
                        value={String((selectedStep.config as any)?.tag ?? '')}
                        onChange={(e) => updateSelectedConfig({ tag: e.target.value })}
                        className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                        placeholder="pricing"
                      />
                    </div>
                  )}
                  {(String((selectedStep.config as any)?.kind ?? '') === 'trigger.list_joined' || String((selectedStep.config as any)?.kind ?? '') === 'trigger.list_left') && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">List (optional)</label>
                      <input
                        value={String((selectedStep.config as any)?.list ?? '')}
                        onChange={(e) => updateSelectedConfig({ list: e.target.value })}
                        className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                        placeholder="newsletter"
                      />
                    </div>
                  )}
                  {String((selectedStep.config as any)?.kind ?? '') === 'trigger.page_visited' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">URL contains (optional)</label>
                      <input
                        value={String((selectedStep.config as any)?.urlContains ?? '')}
                        onChange={(e) => updateSelectedConfig({ urlContains: e.target.value })}
                        className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                        placeholder="/pricing"
                      />
                    </div>
                  )}
                </div>
              )}

              {selectedStep.type === 'action' && (selectedStep.config as any)?.kind === 'action.send_email' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-slate-700 font-semibold">
                    <Mail className="app-icon app-icon-muted w-4 h-4" />
                    Send Email
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email Template</label>
                    <Select<string>
                      value={String((selectedStep.config as any)?.template ?? 'Welcome V3')}
                      onChange={(v) => updateSelectedConfig({ template: v })}
                      options={[
                        { value: 'Welcome V3', label: 'Welcome V3' },
                        { value: 'Follow-up', label: 'Follow-up' },
                        { value: 'Sales', label: 'Sales' },
                        { value: 'Nurture', label: 'Nurture' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                    <input
                      value={String((selectedStep.config as any)?.subject ?? '')}
                      onChange={(e) => updateSelectedConfig({ subject: e.target.value })}
                      className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                      placeholder="Email subject"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Body</label>
                    <textarea
                      value={String((selectedStep.config as any)?.body ?? '')}
                      onChange={(e) => updateSelectedConfig({ body: e.target.value })}
                      className="w-full h-32 bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none resize-none"
                      placeholder="Hi {{firstName}},\n\n..."
                    />
                  </div>
                  <button
                    type="button"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-semibold text-sm flex items-center justify-center gap-2 icon-inherit"
                    onClick={() => setIsEmailPreviewOpen(true)}
                  >
                    <Eye className="app-icon w-4 h-4" />
                    Preview
                  </button>
                </div>
              )}

              {selectedStep.type === 'condition' && (
                <div className="space-y-3">
                  {/* Condition settings */}
                  {String((selectedStep.config as any)?.kind ?? '') === 'condition.lead_score' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Operator</label>
                        <Select<string>
                          value={String((selectedStep.config as any)?.op ?? '>')}
                          onChange={(v) => updateSelectedConfig({ op: v })}
                          options={[
                            { value: '>', label: '>' },
                            { value: '>=', label: '>=' },
                            { value: '<', label: '<' },
                            { value: '<=', label: '<=' },
                          ]}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Value</label>
                        <input
                          type="number"
                          value={Number((selectedStep.config as any)?.value ?? 50)}
                          onChange={(e) => updateSelectedConfig({ value: Number(e.target.value) })}
                          className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                        />
                      </div>
                    </div>
                  )}
                  {String((selectedStep.config as any)?.kind ?? '') === 'condition.lifecycle_stage' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Lifecycle stage</label>
                      <Select<string>
                        value={String((selectedStep.config as any)?.value ?? 'lead')}
                        onChange={(v) => updateSelectedConfig({ value: v })}
                        options={[
                          { value: 'cold', label: 'cold' },
                          { value: 'lead', label: 'lead' },
                          { value: 'mql', label: 'mql' },
                          { value: 'customer', label: 'customer' },
                          { value: 'churned', label: 'churned' },
                        ]}
                      />
                    </div>
                  )}
                  {String((selectedStep.config as any)?.kind ?? '') === 'condition.last_open_days' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">No opens in last N days</label>
                      <input
                        type="number"
                        min={1}
                        value={Number((selectedStep.config as any)?.days ?? 30)}
                        onChange={(e) => updateSelectedConfig({ days: Number(e.target.value) })}
                        className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                      />
                    </div>
                  )}
                  {String((selectedStep.config as any)?.kind ?? '') === 'condition.has_tag' && (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Tag</label>
                      <input
                        value={String((selectedStep.config as any)?.tag ?? '')}
                        onChange={(e) => updateSelectedConfig({ tag: e.target.value })}
                        className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                        placeholder="pricing"
                      />
                    </div>
                  )}

                  <div className="text-sm font-semibold text-slate-900">Branching</div>
                  <div className="grid grid-cols-1 gap-2">
                    <label className="text-xs font-semibold text-slate-500">YES path</label>
                    <Select<string>
                      value={String(((selectedStep.config as any)?.nextYes ?? '') as any)}
                      onChange={(v) => upsertLink(selectedStep.id, { nextYes: v || undefined })}
                      options={[
                        { value: '', label: '— Select step —' },
                        ...steps.filter(s => s.id !== selectedStep.id).map(s => ({ value: s.id, label: s.title })),
                      ]}
                    />
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-semibold text-sm"
                      onClick={() => addStepLinked(selectedStep.id, 'action', { kind: 'action.send_email', title: 'Send Email' }, 'nextYes')}
                    >
                      + Add step as YES
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <label className="text-xs font-semibold text-slate-500">NO path</label>
                    <Select<string>
                      value={String(((selectedStep.config as any)?.nextNo ?? '') as any)}
                      onChange={(v) => upsertLink(selectedStep.id, { nextNo: v || undefined })}
                      options={[
                        { value: '', label: '— Select step —' },
                        ...steps.filter(s => s.id !== selectedStep.id).map(s => ({ value: s.id, label: s.title })),
                      ]}
                    />
                    <button
                      type="button"
                      className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-semibold text-sm"
                      onClick={() => addStepLinked(selectedStep.id, 'action', { kind: 'action.send_email', title: 'Send Email' }, 'nextNo')}
                    >
                      + Add step as NO
                    </button>
                  </div>
                </div>
              )}

              {selectedStep.type === 'action' && (selectedStep.config as any)?.kind === 'action.update_field' && (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-900">Update Field</div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Field</label>
                    <Select<string>
                      value={String((selectedStep.config as any)?.field ?? 'temperature')}
                      onChange={(v) => updateSelectedConfig({ field: v })}
                      options={[
                        { value: 'temperature', label: 'temperature' },
                        { value: 'lifecycleStage', label: 'lifecycleStage' },
                        { value: 'status', label: 'status' },
                        { value: 'leadScore', label: 'leadScore' },
                        { value: 'tag', label: 'tag' },
                        { value: 'list', label: 'list' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Operation</label>
                    <Select<string>
                      value={String((selectedStep.config as any)?.op ?? 'set')}
                      onChange={(v) => updateSelectedConfig({ op: v })}
                      options={[
                        { value: 'set', label: 'set' },
                        { value: 'add', label: 'add' },
                        { value: 'remove', label: 'remove' },
                      ]}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Value</label>
                    <input
                      value={String((selectedStep.config as any)?.value ?? '')}
                      onChange={(e) => updateSelectedConfig({ value: e.target.value })}
                      className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                      placeholder="warm / lead / pricing / newsletter"
                    />
                  </div>
                </div>
              )}

              {selectedStep.type === 'action' && (selectedStep.config as any)?.kind === 'action.notify' && (
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-slate-900">Notify Team (email)</div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">To email</label>
                    <input
                      value={String((selectedStep.config as any)?.toEmail ?? '')}
                      onChange={(e) => updateSelectedConfig({ toEmail: e.target.value })}
                      className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                      placeholder="team@yourcompany.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                    <input
                      value={String((selectedStep.config as any)?.subject ?? '')}
                      onChange={(e) => updateSelectedConfig({ subject: e.target.value })}
                      className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none"
                      placeholder="Automation alert"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Body</label>
                    <textarea
                      value={String((selectedStep.config as any)?.body ?? '')}
                      onChange={(e) => updateSelectedConfig({ body: e.target.value })}
                      className="w-full h-28 bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none resize-none"
                      placeholder="Contact {{email}} triggered pricing link click…"
                    />
                  </div>
                </div>
              )}

              {selectedStep.type !== 'condition' && (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-slate-900">Next step</div>
                  <Select<string>
                    value={String(((selectedStep.config as any)?.next ?? '') as any)}
                    onChange={(v) => upsertLink(selectedStep.id, { next: v || undefined })}
                    options={[
                      { value: '', label: '— Select step —' },
                      ...steps.filter(s => s.id !== selectedStep.id).map(s => ({ value: s.id, label: s.title })),
                    ]}
                  />
                </div>
              )}

              <div className="text-xs text-slate-500 border-t border-slate-100 pt-4">
                Type: <span className="font-semibold text-slate-700">{selectedStep.type}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Email preview modal */}
      {isEmailPreviewOpen && selectedStep && (selectedStep.config as any)?.kind === 'action.send_email' && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <div className="text-xs text-slate-500 font-medium">Preview</div>
                <div className="font-semibold text-slate-900">{String((selectedStep.config as any)?.subject ?? '(No subject)')}</div>
              </div>
              <button onClick={() => setIsEmailPreviewOpen(false)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">
                Close
              </button>
            </div>
            <div className="p-6 bg-slate-50">
              <div className="max-w-xl mx-auto bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-3">
                <div className="text-sm text-slate-700 whitespace-pre-line">
                  {String((selectedStep.config as any)?.body ?? 'Hi {{firstName}},\n\nThis is a preview of the email body.')}
                </div>
                <div className="pt-2">
                  <a className="inline-flex px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold" href="#">
                    Shop Now
                  </a>
                </div>
                <div className="pt-4 border-t border-slate-100 text-xs text-slate-500">Unsubscribe</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Test run modal */}
      {isTestOpen && (
        <div className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="font-semibold text-slate-900">Test automation</div>
              <button
                onClick={() => { if (!testBusy) setIsTestOpen(false); }}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                title="Close"
              >
                <X className="app-icon w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-sm text-slate-700">
                This will create an <span className="font-semibold">automation run</span> for a contact and process the queue once.
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Contact</label>
                <Select<string>
                  value={testContactId}
                  onChange={(v) => setTestContactId(String(v))}
                  options={[
                    { value: '', label: '— Select contact —' },
                    ...contacts.slice(0, 200).map((c) => ({ value: c.id, label: `${c.name || c.email || c.id}` })),
                  ]}
                />
              </div>
              <div className="text-xs text-slate-500">
                Tip: After running, open <span className="font-semibold">Runs</span> to confirm it completed (or see errors).
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 bg-white flex items-center justify-end gap-2">
              <button
                disabled={testBusy}
                onClick={() => setIsTestOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={testBusy}
                onClick={() => { void runTest(); }}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold disabled:opacity-50"
              >
                {testBusy ? 'Running…' : 'Run test'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AutomationRunsModal
        isOpen={runsOpen}
        onClose={() => { setRunsOpen(false); setFocusRunId(null); }}
        automationId={automation.id}
        runId={focusRunId}
      />

      <AlertDialog isOpen={!!alert} title={alert?.title ?? 'Info'} message={alert?.message ?? ''} onClose={() => setAlert(null)} />
    </div>
  );
};

export default AutomationBuilderView;


