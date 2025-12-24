import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Filter, Mail, Eye, MousePointer, UserMinus, ShieldAlert, Ban, Link as LinkIcon } from 'lucide-react';
import { useAppStore } from '../store/AppStore';
import AnalyticsView from './AnalyticsView';
import type { ChartData } from '../types';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import type { DateRangePreset } from '../store/AppStore';
import { Select } from './ui/Select';
import { getSupabase, getWorkspaceId } from '../services/supabase';

const ReportsView: React.FC = () => {
  const { state, actions } = useAppStore();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');
  const dateRangePreset: DateRangePreset = state.ui?.dateRangePreset ?? '30d';
  const [segment, setSegment] = useState<'All' | 'Warm Leads' | 'Cold Leads' | 'Customers'>('All');
  const [recipientRows, setRecipientRows] = useState<Array<{ to_email: string; status: string; sent_at: string | null }>>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientsError, setRecipientsError] = useState<string | null>(null);
  const [reportChartData, setReportChartData] = useState<ChartData[]>([]);
  const [kpi, setKpi] = useState<{ delivered: number; opens: number; clicks: number; openRate: number; clickRate: number; unsub: number; spam: number; bounces: number }>({
    delivered: 0,
    opens: 0,
    clicks: 0,
    openRate: 0,
    clickRate: 0,
    unsub: 0,
    spam: 0,
    bounces: 0,
  });
  const [topLinks, setTopLinks] = useState<Array<{ url: string; clicks: number }>>([]);
  const [blockHeatmap, setBlockHeatmap] = useState<Array<{ bid: string; label: string; clicks: number; url?: string }>>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

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

  // Real recipient list per campaign (from public.email_sends)
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (selectedCampaignId === 'all') {
        setRecipientRows([]);
        setRecipientsError(null);
        setRecipientsLoading(false);
        return;
      }
      try {
        setRecipientsLoading(true);
        setRecipientsError(null);
        const supabase = getSupabase();
        if (!supabase) throw new Error('Supabase not configured');
        const ws = getWorkspaceId() || 'default';
        const { data, error } = await supabase
          .from('email_sends')
          .select('to_email,status,sent_at')
          .eq('workspace_id', ws)
          .eq('campaign_id', selectedCampaignId)
          .order('created_at', { ascending: false })
          .limit(200);
        if (cancelled) return;
        if (error) throw error;
        setRecipientRows((data as any[])?.map((r) => ({
          to_email: String(r.to_email ?? ''),
          status: String(r.status ?? ''),
          sent_at: r.sent_at ? String(r.sent_at) : null,
        })) ?? []);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setRecipientsError(msg);
        setRecipientRows([]);
      } finally {
        if (!cancelled) setRecipientsLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [selectedCampaignId]);
  const chartData: ChartData[] = useMemo(() => {
    return selectedCampaignId === 'all' ? state.chartData : reportChartData;
  }, [selectedCampaignId, reportChartData, state.chartData]);

  const summary = useMemo(() => {
    return {
      totalSent: kpi.delivered,
      totalSentDeltaPct: 0,
      avgClickRate: kpi.clickRate,
      avgClickDeltaPct: 0,
      subscriberGrowth: 0,
      subscriberGrowthDeltaPct: 0,
    };
  }, [kpi]);

  const kpis = useMemo(() => kpi, [kpi]);

  const startDate = useMemo(() => {
    const now = new Date();
    if (dateRangePreset === 'ytd') return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const days = dateRangePreset === '90d' ? 90 : 30;
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - (days - 1));
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }, [dateRangePreset]);

  const buildBuckets = (preset: DateRangePreset) => {
    const now = new Date();
    const end = new Date(now);
    end.setUTCHours(23, 59, 59, 999);
    if (preset === 'ytd') {
      const buckets: Array<{ start: Date; end: Date; label: string }> = [];
      const cur = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      cur.setUTCDate(1);
      while (cur <= end) {
        const s = new Date(cur);
        const e = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 0, 23, 59, 59, 999));
        buckets.push({ start: s, end: e, label: s.toLocaleDateString('en-US', { month: 'short' }) });
        cur.setUTCMonth(cur.getUTCMonth() + 1);
      }
      return buckets.slice(-12);
    }
    if (preset === '90d') {
      const buckets: Array<{ start: Date; end: Date; label: string }> = [];
      const cur = new Date(startDate);
      while (cur <= end) {
        const s = new Date(cur);
        const e = new Date(cur);
        e.setUTCDate(e.getUTCDate() + 6);
        e.setUTCHours(23, 59, 59, 999);
        buckets.push({ start: s, end: e, label: s.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) });
        cur.setUTCDate(cur.getUTCDate() + 7);
      }
      return buckets;
    }
    const buckets: Array<{ start: Date; end: Date; label: string }> = [];
    const cur = new Date(startDate);
    while (cur <= end) {
      const s = new Date(cur);
      const e = new Date(cur);
      e.setUTCHours(23, 59, 59, 999);
      buckets.push({ start: s, end: e, label: s.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return buckets;
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setAnalyticsLoading(true);
        setAnalyticsError(null);
        const sb = getSupabase();
        if (!sb) throw new Error('Supabase not configured');

        const ws = getWorkspaceId() || 'default';
        const startIso = startDate.toISOString();
        const endIso = new Date().toISOString();
        const buckets = buildBuckets(dateRangePreset);

        const base = sb
          .from('email_sends')
          .select('status,sent_at,opened_at,clicked_at,created_at')
          .eq('workspace_id', ws)
          .gte('created_at', startIso)
          .limit(10000);
        const q = selectedCampaignId === 'all' ? base : base.eq('campaign_id', selectedCampaignId);
        const { data: rows, error } = await q;
        if (error) throw error;
        if (cancelled) return;

        // With SMTP we don't have true "delivered" events; we treat non-failed as delivered-attempted.
        const delivered = (rows ?? []).filter((r: any) => String(r?.status ?? '').toLowerCase() !== 'failed').length;
        const opens = (rows ?? []).filter((r: any) => Boolean(r.opened_at)).length;
        const clicks = (rows ?? []).filter((r: any) => Boolean(r.clicked_at)).length;

        const { data: unsubRows, error: unsubErr } = await sb
          .from('contact_events')
          .select('id')
          .eq('workspace_id', ws)
          .eq('event_type', 'unsubscribed')
          .gte('occurred_at', startIso)
          .lte('occurred_at', endIso)
          .limit(10000);
        if (unsubErr) throw unsubErr;

        const inBucket = (ts: string | null, b: { start: Date; end: Date }) => {
          if (!ts) return false;
          const d = new Date(ts);
          return d >= b.start && d <= b.end;
        };
        const series: ChartData[] = buckets.map((b) => ({
          name: b.label,
          opens: (rows ?? []).filter((r: any) => inBucket(r.opened_at, b)).length,
          clicks: (rows ?? []).filter((r: any) => inBucket(r.clicked_at, b)).length,
          conversions: 0,
        }));
        setReportChartData(series);

        setKpi({
          delivered,
          opens,
          clicks,
          openRate: delivered > 0 ? opens / delivered : 0,
          clickRate: delivered > 0 ? clicks / delivered : 0,
          unsub: Array.isArray(unsubRows) ? unsubRows.length : 0,
          spam: 0,
          bounces: 0,
        });

        const evBase = sb
          .from('contact_events')
          .select('meta,campaign_id,occurred_at')
          .eq('workspace_id', ws)
          .eq('event_type', 'link_click')
          .gte('occurred_at', startIso)
          .lte('occurred_at', endIso)
          .limit(10000);
        const evQ = selectedCampaignId === 'all' ? evBase : evBase.eq('campaign_id', selectedCampaignId);
        const { data: evRows, error: evErr } = await evQ;
        if (evErr) throw evErr;
        if (cancelled) return;
        const counts = new Map<string, number>();
        const bidCounts = new Map<string, number>();
        const bidUrl = new Map<string, string>();
        (evRows ?? []).forEach((r: any) => {
          const url = String(r?.meta?.url ?? '').trim();
          const bid = String(r?.meta?.bid ?? '').trim();
          if (!url) return;
          counts.set(url, (counts.get(url) ?? 0) + 1);
          if (bid) {
            bidCounts.set(bid, (bidCounts.get(bid) ?? 0) + 1);
            if (!bidUrl.has(bid)) bidUrl.set(bid, url);
          }
        });
        const top = Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([url, clicks]) => ({ url, clicks }));
        setTopLinks(top);

        // Block heatmap (real clicks per email block id). Only meaningful when a single campaign is selected.
        if (selectedCampaignId !== 'all' && selectedCampaign?.emailBlocks && Array.isArray((selectedCampaign as any).emailBlocks)) {
          const blocks = (selectedCampaign as any).emailBlocks as any[];
          const labeled = blocks
            .map((b, idx) => {
              const bid = String(b?.id ?? '').trim();
              if (!bid) return null;
              const type = String(b?.type ?? '').trim();
              const text = String(b?.text ?? '').trim();
              const href = String(b?.href ?? '').trim();
              const label = type === 'button'
                ? (text || 'Button')
                : type === 'header'
                  ? (text || 'Header')
                  : type === 'text'
                    ? (text ? (text.length > 60 ? `${text.slice(0, 60)}…` : text) : 'Text')
                    : (type || `Block ${idx + 1}`);
              const clicks = bidCounts.get(bid) ?? 0;
              return { bid, label, clicks, url: href || bidUrl.get(bid) };
            })
            .filter(Boolean) as Array<{ bid: string; label: string; clicks: number; url?: string }>;
          setBlockHeatmap(labeled);
        } else {
          setBlockHeatmap([]);
        }
      } catch (e) {
        if (cancelled) return;
        setAnalyticsError(e instanceof Error ? e.message : String(e));
        setReportChartData([]);
        setTopLinks([]);
        setBlockHeatmap([]);
        setKpi({ delivered: 0, opens: 0, clicks: 0, openRate: 0, clickRate: 0, unsub: 0, spam: 0, bounces: 0 });
      } finally {
        if (!cancelled) setAnalyticsLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [dateRangePreset, selectedCampaignId, startDate]);

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

            <div className="text-xs text-slate-500" />
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

          {/* Charts + links */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-8">
              <AnalyticsView data={chartData} summary={summary} />
            </div>
            <Card className="xl:col-span-4 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">Top Links</div>
                  <div className="text-xs text-slate-500 mt-1" />
                </div>
                <div className="text-xs text-slate-500">{analyticsLoading ? 'Loading…' : ''}</div>
              </div>

              {analyticsError && (
                <div className="mt-3 text-sm text-red-600">Failed to load: {analyticsError}</div>
              )}

              {!analyticsError && (
                <div className="mt-4 space-y-2">
                  {topLinks.length === 0 ? (
                    <div className="text-sm text-slate-500">No tracked link clicks yet.</div>
                  ) : (
                    topLinks.map((l) => (
                      <div key={l.url} className="flex items-start justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-white">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-slate-800 font-medium text-sm">
                            <LinkIcon className="app-icon w-4 h-4 text-slate-400" />
                            <span className="truncate">{l.url}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-sm font-semibold text-slate-900">{l.clicks}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </Card>
          </div>

          {selectedCampaignId !== 'all' && (
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">Heatmap (Real Clicks by Email Block)</div>
                  <div className="text-xs text-slate-500 mt-1">
                    Shows how many clicks each tracked block (button/link) received for this campaign.
                  </div>
                </div>
                <div className="text-xs text-slate-500">{analyticsLoading ? 'Loading…' : ''}</div>
              </div>

              {analyticsError && (
                <div className="mt-3 text-sm text-red-600">Failed to load: {analyticsError}</div>
              )}

              {!analyticsError && (
                <div className="mt-4 space-y-2">
                  {blockHeatmap.length === 0 ? (
                    <div className="text-sm text-slate-500">
                      No heatmap data yet. This appears after you send a campaign and recipients click a tracked button/link.
                    </div>
                  ) : (
                    (() => {
                      const max = Math.max(1, ...blockHeatmap.map(x => x.clicks));
                      const sorted = [...blockHeatmap].sort((a, b) => b.clicks - a.clicks);
                      return sorted.map((b) => {
                        const pct = Math.max(0, Math.min(1, b.clicks / max));
                        return (
                          <div key={b.bid} className="p-3 rounded-xl border border-slate-200 bg-white">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-900 truncate">{b.label}</div>
                                {b.url ? (
                                  <div className="mt-1 text-xs text-slate-500 truncate">{b.url}</div>
                                ) : null}
                              </div>
                              <div className="shrink-0 text-sm font-semibold text-slate-900">{b.clicks}</div>
                            </div>
                            <div className="mt-2 h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-sky-500"
                                style={{ width: `${Math.round(pct * 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
              )}
            </Card>
          )}

          {selectedCampaignId !== 'all' && (
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">Recipients</div>
                  <div className="text-xs text-slate-500 mt-1" />
                </div>
                <Button
                  variant="secondary"
                  onClick={() => actions.refreshChartData()}
                >
                  Refresh
                </Button>
              </div>

              <div className="mt-4">
                {recipientsLoading && <div className="text-sm text-slate-600">Loading recipients…</div>}
                {!recipientsLoading && recipientsError && (
                  <div className="text-sm text-red-600">Failed to load recipients: {recipientsError}</div>
                )}
                {!recipientsLoading && !recipientsError && (
                  <>
                    <div className="text-sm text-slate-700 mb-3">
                      Showing <span className="font-semibold">{recipientRows.length}</span> most recent recipients (max 200).
                    </div>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Sent at</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {recipientRows.map((r) => (
                            <tr key={`${r.to_email}-${r.sent_at ?? ''}`} className="hover:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-slate-800">{r.to_email}</td>
                              <td className="px-4 py-3 text-slate-700">{r.status}</td>
                              <td className="px-4 py-3 text-slate-600">{r.sent_at ? new Date(r.sent_at).toLocaleString() : '-'}</td>
                            </tr>
                          ))}
                          {recipientRows.length === 0 && (
                            <tr>
                              <td className="px-4 py-6 text-slate-500" colSpan={3}>
                                No recipients yet. Send the campaign to populate this list.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportsView;


