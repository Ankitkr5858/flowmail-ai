import React from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { TrendingUp, TrendingDown, RefreshCw, Calendar, MoreHorizontal } from 'lucide-react';
import { Metric, Campaign, Automation, ChartData } from '../types';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import type { DateRangePreset } from '../store/AppStore';
import { Select } from './ui/Select';

interface DashboardProps {
  metrics: Metric[];
  chartData: ChartData[];
  campaigns: Campaign[];
  automations: Automation[];
  dateRangePreset: DateRangePreset;
  onDateRangePresetChange: (preset: DateRangePreset) => void;
  onRefresh: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ metrics, chartData, campaigns, automations, dateRangePreset, onDateRangePresetChange, onRefresh }) => {
  const activeCount = automations.filter(a => a.status === 'Running').length;
  const pausedCount = automations.filter(a => a.status === 'Paused').length;
  const errorsCount = automations.reduce((sum, a) => sum + (a.errorCount ?? 0), 0);
  const totalCount = automations.length || 1;
  const healthyCount = automations.filter(a => a.status === 'Running' && (a.errorCount ?? 0) === 0).length;
  const healthyPct = Math.round((healthyCount / totalCount) * 100);
  const issuePct = 100 - healthyPct;
  const activeAutomations = automations.filter(a => a.status === 'Running');

  const HEALTH_DATA = [
    { name: 'Healthy', value: healthyPct },
    { name: 'Issues', value: issuePct },
  ];
  const HEALTH_COLORS = ['#0284c7', '#e2e8f0'];

  return (
    <div className="space-y-6">
      
      {/* Top Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
           <h1 className="text-2xl font-bold text-slate-800">Dashboard Overview</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-2 rounded-lg text-sm text-slate-700">
              <Calendar className="app-icon app-icon-muted w-4 h-4" />
              <div className="min-w-[180px]">
                <Select<DateRangePreset>
                  value={dateRangePreset}
                  onChange={onDateRangePresetChange}
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
          </div>
          <Button variant="primary" size="icon" aria-label="Refresh" onClick={onRefresh}>
            <RefreshCw className="app-icon w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, index) => (
          <Card key={index} className="p-4 hover:shadow-md transition-shadow border-slate-100">
            <p className="text-slate-500 text-sm font-medium mb-1">{metric.label}</p>
            <div className="flex items-end justify-between">
               <h3 className="text-2xl font-bold text-slate-800 tracking-tight">{metric.value}</h3>
            </div>
            <div className={`flex items-center gap-1 mt-2 text-sm font-medium icon-inherit ${metric.trend === 'up' ? 'text-emerald-600' : 'text-red-600'}`}>
              {metric.trend === 'up' ? <TrendingUp className="app-icon w-4 h-4" /> : <TrendingDown className="app-icon w-4 h-4" />}
              <span>{metric.change}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Performance Chart */}
        <Card className="lg:col-span-2 p-6 border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-slate-800 text-lg">Email Performance Over Time</h3>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-sky-400"></span>
                <span className="text-slate-600">Opens</span>
              </div>
               <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-sky-600"></span>
                <span className="text-slate-600">Clicks</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                <span className="text-slate-600">Conversions</span>
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOpens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                  </linearGradient>
                   <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284c7" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#0284c7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="opens" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#colorOpens)" />
                <Area type="monotone" dataKey="clicks" stroke="#0284c7" strokeWidth={2} fillOpacity={1} fill="url(#colorClicks)" />
                <Area type="monotone" dataKey="conversions" stroke="#10b981" strokeWidth={2} fillOpacity={0} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Automation Health Donut */}
        <Card className="p-6 border-slate-100 flex flex-col items-center justify-center relative">
          <div className="w-full text-left mb-4">
             <h3 className="font-semibold text-slate-800 text-lg">Automation Health</h3>
          </div>
          
          <div className="relative w-48 h-48 flex items-center justify-center">
             <ResponsiveContainer width="100%" height="100%">
               <PieChart>
                 <Pie
                   data={HEALTH_DATA}
                   innerRadius={60}
                   outerRadius={80}
                   paddingAngle={5}
                   dataKey="value"
                   startAngle={90}
                   endAngle={-270}
                 >
                   {HEALTH_DATA.map((entry, index) => (
                     <Cell key={`cell-${index}`} fill={HEALTH_COLORS[index % HEALTH_COLORS.length]} strokeWidth={0} />
                   ))}
                 </Pie>
               </PieChart>
             </ResponsiveContainer>
             <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-3xl font-bold text-slate-800">{healthyPct}%</span>
                <span className="text-xs text-slate-500 font-medium">{healthyPct >= 90 ? 'Healthy' : healthyPct >= 70 ? 'Fair' : 'Needs Attention'}</span>
             </div>
          </div>

          <div className="grid grid-cols-3 gap-4 w-full mt-6 text-center border-t border-slate-100 pt-6">
            <div>
              <p className="text-xs text-slate-500 mb-1">Active:</p>
              <p className="text-xl font-bold text-slate-700">{activeCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Paused:</p>
              <p className="text-xl font-bold text-slate-700">{pausedCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Errors:</p>
              <p className="text-xl font-bold text-red-500">{errorsCount}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Bottom Lists Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Recent Campaigns */}
        <Card className="p-6 border-slate-100">
          <h3 className="font-semibold text-slate-800 text-lg mb-4">Recent Campaigns</h3>
          <div className="space-y-4">
            {campaigns.map((campaign) => (
              <div key={campaign.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors group">
                <div>
                  <h4 className="font-medium text-slate-800 text-sm">{campaign.name}</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    {campaign.createdAt ? new Date(campaign.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : campaign.date}
                  </p>
                </div>
                <div className="flex items-center gap-4">
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
                  <span className="text-sm font-semibold text-slate-700 w-16 text-right">
                    {campaign.openRate && campaign.openRate !== '-' ? campaign.openRate : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Active Automations */}
        <Card className="p-6 border-slate-100">
          <h3 className="font-semibold text-slate-800 text-lg mb-4">Active Automations</h3>
          {activeAutomations.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
              No active automations
            </div>
          ) : (
            <div className="space-y-4">
              {activeAutomations.map((auto) => (
                <div key={auto.id} className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-lg transition-colors">
                  <div>
                    <h4 className="font-medium text-slate-800 text-sm">{auto.name}</h4>
                    <p className="text-xs text-slate-500 mt-1">{auto.runs}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge variant="success">Running</Badge>
                    <span className="text-sm font-semibold text-slate-700 w-12 text-right">{auto.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

      </div>
    </div>
  );
};

export default Dashboard;