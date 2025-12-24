import React, { useMemo, useState } from 'react';
import { Blocks, FileEdit, Search } from 'lucide-react';
import type { Campaign } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';

interface ContentViewProps {
  campaigns: Campaign[];
  onOpenBuilder: (campaignId: string) => void;
  composeForContactName?: string | null;
}

const ContentView: React.FC<ContentViewProps> = ({ campaigns, onOpenBuilder, composeForContactName }) => {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return campaigns;
    return campaigns.filter(c => c.name.toLowerCase().includes(s) || (c.topic ?? '').toLowerCase().includes(s));
  }, [campaigns, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Content</h1>
        <p className="text-slate-500 text-sm mt-1">Build and manage campaign email content.</p>
      </div>

      {composeForContactName && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-800 text-sm">
          Composing an email for <span className="font-semibold">{composeForContactName}</span>. Choose a campaign below to edit/send content.
        </div>
      )}

      <Card className="p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 app-icon app-icon-muted w-4 h-4" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search campaigns..."
            className="w-full bg-white text-slate-700 pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-sm"
          />
        </div>
        <div className="text-sm text-slate-500">
          {filtered.length} campaigns
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.map((c) => (
          <Card key={c.id} className="p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center">
                  <Blocks className="app-icon w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-slate-800">{c.name}</div>
                  <div className="text-xs text-slate-500 mt-1">{c.topic || '—'} • {c.status}</div>
                </div>
              </div>
              <Button
                onClick={() => onOpenBuilder(c.id)}
                variant="outline"
                size="sm"
              >
                <FileEdit className="app-icon w-4 h-4" />
                Edit
              </Button>
            </div>
            <div className="mt-4 text-sm text-slate-600 line-clamp-3 whitespace-pre-line">
              {c.body || c.subject || 'No content yet. Open the builder to add blocks.'}
            </div>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card className="col-span-full p-10 text-center text-slate-500">
            No campaigns found.
          </Card>
        )}
      </div>
    </div>
  );
};

export default ContentView;


