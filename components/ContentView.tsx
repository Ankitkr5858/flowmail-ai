import React, { useMemo } from 'react';
import type { Campaign } from '../types';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { FileText, Sparkles } from 'lucide-react';

interface ContentViewProps {
  campaigns: Campaign[];
  onOpenBuilder: (campaignId: string) => void;
  composeForContactName?: string | null;
}

function badgeVariantForStatus(status: Campaign['status']): React.ComponentProps<typeof Badge>['variant'] {
  switch (status) {
    case 'Sent':
      return 'success';
    case 'Scheduled':
      return 'warning';
    case 'Active':
      return 'info';
    case 'Draft':
    default:
      return 'default';
  }
}

function formatUpdatedAt(c: Campaign) {
  const iso = c.updatedAt ?? c.createdAt;
  if (!iso) return c.date;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return c.date;
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

export default function ContentView({ campaigns, onOpenBuilder, composeForContactName }: ContentViewProps) {
  const rows = useMemo(() => {
    return [...campaigns].sort((a, b) => {
      const ta = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
      const tb = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
      return tb - ta;
    });
  }, [campaigns]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Content</h1>
          <p className="text-slate-500 text-sm mt-1">Open an email campaign to edit its content in the builder.</p>
        </div>
      </div>

      {composeForContactName && (
        <Card className="p-4 flex items-start gap-3 bg-sky-50/60 border-sky-100">
          <div className="w-10 h-10 rounded-lg bg-white border border-sky-100 flex items-center justify-center">
            <Sparkles className="app-icon app-icon-brand w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-900 truncate">Composing for {composeForContactName}</div>
            <div className="text-xs text-slate-600 mt-0.5">
              You can use placeholders like <span className="font-mono">{'{{firstName}}'}</span> inside your email content.
            </div>
          </div>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
            <FileText className="app-icon app-icon-muted w-6 h-6" />
          </div>
          <div className="mt-4 font-semibold text-slate-900">No campaigns yet</div>
          <div className="mt-1 text-sm text-slate-500">Create a campaign first, then come back here to edit its email.</div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {rows.map((c) => (
            <Card key={c.id} className="p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate">{c.name}</div>
                  <div className="text-xs text-slate-500 mt-1 truncate">{c.subject || '(No subject)'}</div>
                </div>
                <Badge variant={badgeVariantForStatus(c.status)}>{c.status}</Badge>
              </div>

              <div className="mt-4 text-xs text-slate-500">Last updated: {formatUpdatedAt(c)}</div>

              <div className="mt-5 flex items-center gap-2">
                <Button variant="primary" onClick={() => onOpenBuilder(c.id)}>
                  Edit in Builder
                </Button>
                <Button variant="outline" onClick={() => onOpenBuilder(c.id)}>
                  Open
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}


