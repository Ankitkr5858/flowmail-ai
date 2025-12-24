import React, { useState } from 'react';
import { Plus, Search, Filter, FileEdit, Trash2, Send, BarChart2, Blocks, CalendarClock } from 'lucide-react';
import { Campaign } from '../types';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Select } from './ui/Select';
import NewsletterScheduleModal from './NewsletterScheduleModal';

interface CampaignsViewProps {
  onCreate: () => void;
  campaigns: Campaign[];
  onDelete: (id: string) => void;
  onEdit: (campaign: Campaign) => void;
  onAnalytics: (id: string) => void;
  onOpenContent: (id: string) => void;
  onSendNow: (id: string) => void;
}

const CampaignsView: React.FC<CampaignsViewProps> = ({ onCreate, campaigns, onDelete, onEdit, onAnalytics, onOpenContent, onSendNow }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [scheduleForId, setScheduleForId] = useState<string | null>(null);

  const filteredCampaigns = campaigns.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'All Status' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Campaigns</h1>
          <p className="text-slate-500 text-sm mt-1">Manage, edit, and analyze your email blasts.</p>
        </div>
        <Button onClick={onCreate} variant="primary">
          <Plus className="app-icon w-4 h-4" />
          Create Campaign
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 app-icon app-icon-muted w-4 h-4" />
          <input 
            type="text" 
            placeholder="Search campaigns..." 
            className="w-full bg-white text-slate-700 pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 text-sm font-medium flex items-center gap-2 icon-inherit">
            <Filter className="app-icon w-4 h-4" />
            Filter
          </button>
          <div className="min-w-[170px]">
            <Select<string>
              value={statusFilter}
              onChange={(v) => setStatusFilter(v)}
              options={[
                { value: 'All Status', label: 'All Status' },
                { value: 'Sent', label: 'Sent' },
                { value: 'Scheduled', label: 'Scheduled' },
                { value: 'Draft', label: 'Draft' },
                { value: 'Active', label: 'Active' },
              ]}
              buttonClassName="px-4 py-2"
            />
          </div>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Campaign Name</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Performance</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredCampaigns.map((campaign) => (
              <tr key={campaign.id} className="hover:bg-slate-50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="font-medium text-slate-800">{campaign.name}</div>
                </td>
                <td className="px-6 py-4">
                  <Badge
                    variant={
                      campaign.status === 'Sent' ? 'success' :
                      campaign.status === 'Scheduled' ? 'info' :
                      campaign.status === 'Draft' ? 'default' :
                      'info'
                    }
                  >
                    {campaign.status}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  {campaign.date}
                </td>
                <td className="px-6 py-4 text-right">
                  {(campaign.openRate && campaign.openRate !== '-') ? (
                    <div className="flex flex-col items-end gap-1">
                      <div className="text-sm font-semibold text-slate-800">{campaign.openRate}</div>
                      <div className="text-xs text-slate-500">Open Rate</div>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400">-</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenContent(campaign.id);
                      }}
                      className="p-2 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer icon-inherit"
                      title="Edit Content"
                    >
                      <Blocks className="app-icon w-4 h-4 pointer-events-none" />
                    </button>
                    <button 
                      type="button"
                      onClick={(e) => {
                          e.stopPropagation();
                          onAnalytics(campaign.id);
                      }}
                      className="p-2 text-slate-400 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer icon-inherit" 
                      title="Analytics"
                    >
                      <BarChart2 className="app-icon w-4 h-4 pointer-events-none" />
                    </button>
                    {campaign.status !== 'Sent' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSendNow(campaign.id);
                        }}
                        className="p-2 text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer icon-inherit"
                        title="Send Now"
                      >
                        <Send className="app-icon w-4 h-4 pointer-events-none" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setScheduleForId(campaign.id);
                      }}
                      className="p-2 text-slate-400 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer icon-inherit"
                      title="Schedule Newsletter"
                    >
                      <CalendarClock className="app-icon w-4 h-4 pointer-events-none" />
                    </button>
                    <button 
                      type="button"
                      onClick={(e) => {
                          e.stopPropagation();
                          onEdit(campaign);
                      }}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer icon-inherit" 
                      title="Edit"
                    >
                      <FileEdit className="app-icon w-4 h-4 pointer-events-none" />
                    </button>
                    <button 
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(campaign.id);
                        }}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer icon-inherit" 
                        title="Delete"
                    >
                      <Trash2 className="app-icon w-4 h-4 pointer-events-none" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredCampaigns.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            No campaigns found matching your criteria.
          </div>
        )}
      </div>

      <NewsletterScheduleModal
        isOpen={!!scheduleForId}
        onClose={() => setScheduleForId(null)}
        campaignId={scheduleForId ?? ''}
      />
    </div>
  );
};

export default CampaignsView;