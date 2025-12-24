import React, { useState } from 'react';
import { Plus, Zap, GitBranch, PlayCircle, PauseCircle, MoreHorizontal } from 'lucide-react';
import { Automation } from '../types';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import AutomationRunsModal from './AutomationRunsModal';

interface AutomationsViewProps {
  automations: Automation[];
  onCreate: () => void;
  onOpen: (id: string) => void;
  onToggleStatus: (id: string) => void;
  onDelete: (id: string) => void;
}

const AutomationsView: React.FC<AutomationsViewProps> = ({ automations, onCreate, onOpen, onToggleStatus, onDelete }) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [runsForId, setRunsForId] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Automations</h1>
          <p className="text-slate-500 text-sm mt-1">Build automated workflows triggered by user actions.</p>
        </div>
        <Button onClick={onCreate} variant="primary">
          <Plus className="app-icon w-4 h-4" />
          New Automation
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Create New Card */}
        <div onClick={onCreate} className="border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:border-sky-400 hover:bg-sky-50 transition-colors group min-h-[200px]">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-sky-100 transition-colors">
            <Plus className="app-icon app-icon-muted w-6 h-6 group-hover:!text-sky-700" />
          </div>
          <h3 className="font-semibold text-slate-700">Create from Scratch</h3>
          <p className="text-sm text-slate-500 mt-2">Design a custom workflow with multiple triggers.</p>
        </div>

        {automations.map((automation) => (
          <Card
            key={automation.id}
            onClick={() => onOpen(automation.id)}
            className="p-6 hover:shadow-md transition-shadow relative group cursor-pointer"
          >
            <div className="absolute top-6 right-6">
               <div className="relative">
                 <button
                   onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === automation.id ? null : automation.id); }}
                   className="text-slate-400 hover:text-slate-600"
                   title="Actions"
                 >
                 <MoreHorizontal className="app-icon app-icon-muted w-5 h-5" />
                 </button>
                 {openMenuId === automation.id && (
                   <div
                     onClick={(e) => e.stopPropagation()}
                     className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-20"
                   >
                     <button
                       onClick={() => { setOpenMenuId(null); onOpen(automation.id); }}
                       className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 text-slate-700"
                     >
                       Open Builder
                     </button>
                     <button
                       onClick={() => { setOpenMenuId(null); onToggleStatus(automation.id); }}
                       className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 text-slate-700"
                     >
                       {automation.status === 'Running' ? 'Pause' : 'Resume'}
                     </button>
                     <button
                       onClick={() => { setOpenMenuId(null); setRunsForId(automation.id); }}
                       className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 text-slate-700"
                     >
                       View Runs
                     </button>
                     <button
                       onClick={() => { setOpenMenuId(null); if (window.confirm('Delete this automation?')) onDelete(automation.id); }}
                       className="w-full text-left px-4 py-3 text-sm hover:bg-red-50 text-red-700"
                     >
                       Delete
                     </button>
                   </div>
                 )}
               </div>
            </div>
            
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${automation.status === 'Running' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                <Zap className="app-icon w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">{automation.name}</h3>
                <Badge variant={automation.status === 'Running' ? 'success' : 'default'}>{automation.status}</Badge>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <GitBranch className="app-icon app-icon-muted w-4 h-4" />
                <span>Trigger: <span className="font-medium text-slate-800">{automation.trigger || 'User subscribes'}</span></span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <PlayCircle className="app-icon app-icon-muted w-4 h-4" />
                <span>Active contacts: <span className="font-medium text-slate-800">{automation.count}</span></span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Last activity: {automation.lastActivityAt ? new Date(automation.lastActivityAt).toLocaleString() : '—'}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleStatus(automation.id); }}
                className={`text-sm font-medium flex items-center gap-1 ${automation.status === 'Running' ? 'text-amber-600 hover:text-amber-700' : 'text-emerald-600 hover:text-emerald-700'}`}
              >
                {automation.status === 'Running' ? (
                  <>
                    <PauseCircle className="app-icon w-4 h-4" /> Pause
                  </>
                ) : (
                  <>
                    <PlayCircle className="app-icon w-4 h-4" /> Resume
                  </>
                )}
              </button>
            </div>
          </Card>
        ))}
      </div>

      <AutomationRunsModal
        isOpen={!!runsForId}
        onClose={() => setRunsForId(null)}
        automationId={runsForId}
      />
    </div>
  );
};

export default AutomationsView;
