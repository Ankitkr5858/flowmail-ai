import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Filter, BarChart3, Mail, Eye, MousePointer, UserMinus, ShieldAlert, Ban } from 'lucide-react';
import { useAppStore } from '../store/AppStore';
import AnalyticsView from './AnalyticsView';
import type { ChartData } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import type { DateRangePreset } from '../store/AppStore';
import { Select } from './ui/Select';

const ReportsView: React.FC = () => {
  const { state, actions } = useAppStore();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');
  const dateRangePreset: DateRangePreset = state.ui?.dateRangePreset ?? '30d';
  const [segment, setSegment] = useState<'All' | 'Warm Leads' | 'Cold Leads' | 'Customers'>('All');

  const campaignOptions = useMemo(() => state.campaigns, [state.campaigns]);

  const selectedCampaign = useMemo(() => {
    if (selectedCampaignId === 'all') return null;
    return state.campaigns.find(c => c.id === selectedCampaignId) ?? null;
  }, [selectedCampaignId, state.campaigns]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('flowmail.ai.reports.selectedCampaignId');
      if (stored) setSelectedCampaignId(stored);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('flowmail.ai.reports.selectedCampaignId', selectedCampaignId);
    } catch {
      // ignore
    }
  }, [selectedCampaignId]);
  const chartData: ChartData[] = useMemo(() => {
    if (selectedCampaignId === 'all') return state.chartData;
    const campaign = state.campaigns.find(c => c.id === selectedCampaignId);
    if (!campaign) return state.chartData;

    // Build a tiny deterministic series for this campaign so filtering feels real
    const baseSent = campaign.sentCount ?? 0;
    const baseOpens = campaign.openCount ?? 0;
    const baseClicks = campaign.clickCount ?? 0;
    const baseConv = campaign.conversionCount ?? 0;
    const safe = (n: number) => (Number.isFinite(n) ? n : 0);

    const points = [
      { name: 'Week 1', k: 0.78 },
      { name: 'Week 2', k: 0.92 },
      { name: 'Week 3', k: 1.05 },
      { name: 'Week 4', k: 1.00 },
    ];

    return points.map(p => ({
      name: p.name,
      opens: Math.round(safe(baseOpens) * p.k) || Math.round(safe(baseSent) * 0.22 * p.k),
      clicks: Math.round(safe(baseClicks) * p.k) || Math.round(safe(baseSent) * 0.04 * p.k),
      conversions: Math.round(safe(baseConv) * p.k) || Math.round(safe(baseSent) * 0.01 * p.k),
    }));
  }, [state.chartData, state.campaigns, selectedCampaignId]);

  const summary = useMemo(() => {
    if (selectedCampaignId === 'all') {
      const sentCampaigns = state.campaigns.filter(c => c.status === 'Sent' || c.status === 'Active');
      const totalSent = sentCampaigns.reduce((sum, c) => sum + (c.sentCount ?? 0), 0);
      const totalClicks = sentCampaigns.reduce((sum, c) => sum + (c.clickCount ?? 0), 0);
      const avgClickRate = totalSent > 0 ? totalClicks / totalSent : 0;
      const subscriberGrowth = Math.round(state.contacts.length * 0.03);
      return {
        totalSent,
        totalSentDeltaPct: 0.09,
        avgClickRate,
        avgClickDeltaPct: 0.002,
        subscriberGrowth,
        subscriberGrowthDeltaPct: 0.041,
      };
    }

    const campaign = state.campaigns.find(c => c.id === selectedCampaignId);
    const totalSent = campaign?.sentCount ?? 0;
    const totalClicks = campaign?.clickCount ?? 0;
    const avgClickRate = totalSent > 0 ? totalClicks / totalSent : 0;
    const subscriberGrowth = Math.round((campaign?.openCount ?? 0) * 0.04);
    return {
      totalSent,
      totalSentDeltaPct: 0.12,
      avgClickRate,
      avgClickDeltaPct: -0.004,
      subscriberGrowth,
      subscriberGrowthDeltaPct: 0.018,
    };
  }, [selectedCampaignId, state.campaigns, state.contacts.length]);

  const kpis = useMemo(() => {
    const delivered = summary.totalSent;
    const openRate = (() => {
      if (selectedCampaignId === 'all') {
        const sentCampaigns = state.campaigns.filter(c => c.status === 'Sent' || c.status === 'Active');
        const sent = sentCampaigns.reduce((sum, c) => sum + (c.sentCount ?? 0), 0);
        const opens = sentCampaigns.reduce((sum, c) => sum + (c.openCount ?? 0), 0);
        return sent > 0 ? opens / sent : 0;
      }
      const c = state.campaigns.find(x => x.id === selectedCampaignId);
      const sent = c?.sentCount ?? 0;
      const opens = c?.openCount ?? 0;
      return sent > 0 ? opens / sent : 0;
    })();
    const clickRate = summary.avgClickRate;

    // pseudo metrics (until we have real event logs)
    const unsub = Math.max(0, Math.round(delivered * 0.006));
    const spam = Math.max(0, Math.round(delivered * 0.001));
    const bounces = Math.max(0, Math.round(delivered * 0.012));

    return {
      delivered,
      openRate,
      clickRate,
      unsub,
      spam,
      bounces,
    };
  }, [selectedCampaignId, state.campaigns, summary]);

  const heatmapSpots = useMemo(() => {
    // deterministic-ish based on chartSeed
    const seed = state.ui?.chartSeed ?? 1;
    const rand = (n: number) => {
      const x = Math.sin((seed + n) * 999) * 10000;
      return x - Math.floor(x);
    };
    return [
      { x: 0.64 + rand(1) * 0.06, y: 0.46 + rand(2) * 0.05, r: 0.18 },
      { x: 0.52 + rand(3) * 0.06, y: 0.66 + rand(4) * 0.05, r: 0.14 },
      { x: 0.70 + rand(5) * 0.06, y: 0.30 + rand(6) * 0.05, r: 0.12 },
      { x: 0.32 + rand(7) * 0.06, y: 0.72 + rand(8) * 0.05, r: 0.10 },
    ];
  }, [state.ui?.chartSeed]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Campaign Reporting & Analytics</h1>
          <p className="text-slate-500 text-sm mt-1">KPIs, trends, and engagement heatmaps.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm text-slate-700">
            <CalendarDays className="app-icon app-icon-muted w-4 h-4" />
            <div className="min-w-[180px]">
              <Select<DateRangePreset>
                value={dateRangePreset}
                onChange={(v) => actions.setDateRangePreset(v)}
                options={[
                  { value: '30d', label: 'Last 30 Days' },
                  { value: '90d', label: 'Last 90 Days' },
                  { value: 'ytd', label: 'Year to Date' },
                ]}
                buttonClassName="border-0 bg-transparent hover:bg-transparent px-0 py-0 focus:ring-0"
                menuClassName="w-56"
              />
            </div>
          </div>
          <Button variant="primary" onClick={actions.refreshChartData}>
            <Filter className="app-icon w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Filters sidebar */}
        <Card className="xl:col-span-3 p-5">
          <div className="text-sm font-semibold text-slate-900 mb-4">Filter by</div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Campaign</label>
              <Select<string>
                value={selectedCampaignId}
                onChange={(v) => setSelectedCampaignId(v)}
                options={[
                  { value: 'all', label: 'All Campaigns' },
                  ...campaignOptions.map(c => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Segment</label>
              <Select<'All' | 'Warm Leads' | 'Cold Leads' | 'Customers'>
                value={segment}
                onChange={(v) => setSegment(v)}
                options={[
                  { value: 'All', label: 'All' },
                  { value: 'Warm Leads', label: 'Warm Leads' },
                  { value: 'Cold Leads', label: 'Cold Leads' },
                  { value: 'Customers', label: 'Customers' },
                ]}
              />
            </div>

            <Button variant="secondary" onClick={() => actions.refreshChartData()}>
              Apply Filters
            </Button>

            <div className="text-xs text-slate-500">
              Segment filtering is mocked until we add real audience segments.
            </div>
          </div>
        </Card>

        {/* Main content */}
        <div className="xl:col-span-9 space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                <Mail className="app-icon app-icon-muted w-4 h-4" /> Delivered
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{kpis.delivered.toLocaleString()}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                <Eye className="app-icon app-icon-muted w-4 h-4" /> Open Rate
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{(kpis.openRate * 100).toFixed(1)}%</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                <MousePointer className="app-icon app-icon-muted w-4 h-4" /> Click Rate
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{(kpis.clickRate * 100).toFixed(1)}%</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                <UserMinus className="app-icon app-icon-muted w-4 h-4" /> Unsubs
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{kpis.unsub.toLocaleString()}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                <ShieldAlert className="app-icon app-icon-muted w-4 h-4" /> Spam
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{kpis.spam.toLocaleString()}</div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-slate-600 text-sm font-medium">
                <Ban className="app-icon app-icon-muted w-4 h-4" /> Bounces
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{kpis.bounces.toLocaleString()}</div>
            </Card>
          </div>

          {/* Charts + heatmap */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-8">
              <AnalyticsView data={chartData} summary={summary} />
            </div>
            <Card className="xl:col-span-4 p-5">
              <div className="font-semibold text-slate-900">Click Heatmap</div>
              <div className="text-xs text-slate-500 mt-1">
                {selectedCampaign ? `Preview: ${selectedCampaign.name}` : 'Preview: (All campaigns)'}
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 text-sm font-semibold text-slate-900">
                  Exclusive Deals Inside!
                </div>
                <div className="relative p-4 bg-slate-50">
                  <div className="bg-white border border-slate-200 rounded-lg p-4 text-sm text-slate-700 space-y-3">
                    <div>
                      Hi <span className="font-semibold">{'{{firstName}}'}</span>,
                    </div>
                    <div>Check out the new collection. We think you’ll love it.</div>
                    <div className="flex justify-center">
                      <div className="px-4 py-2 rounded-lg bg-sky-600 text-white font-semibold text-sm">Shop Now</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="h-16 bg-slate-100 rounded-md border border-slate-200" />
                      <div className="h-16 bg-slate-100 rounded-md border border-slate-200" />
                      <div className="h-16 bg-slate-100 rounded-md border border-slate-200" />
                    </div>
                    <div className="text-xs text-slate-500 text-center pt-2 border-t border-slate-100">Unsubscribe</div>
                  </div>

                  {/* heatmap overlay */}
                  <div className="absolute inset-4 pointer-events-none">
                    {heatmapSpots.map((s, idx) => (
                      <div
                        key={idx}
                        className="absolute"
                        style={{
                          left: `${s.x * 100}%`,
                          top: `${s.y * 100}%`,
                          width: `${s.r * 100}%`,
                          height: `${s.r * 100}%`,
                          transform: 'translate(-50%, -50%)',
                          background:
                            'radial-gradient(circle, rgba(239,68,68,0.55) 0%, rgba(239,68,68,0.22) 35%, rgba(239,68,68,0) 70%)',
                          borderRadius: '9999px',
                          filter: 'blur(0.2px)',
                          mixBlendMode: 'multiply',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 text-xs text-slate-500">
                Heatmap is simulated using deterministic hotspots (until we track real click events).
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsView;


