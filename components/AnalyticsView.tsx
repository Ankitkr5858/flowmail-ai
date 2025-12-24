import React from 'react';
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { ChartData } from '../types';
import { ArrowUpRight, ArrowDownRight, MousePointer, Mail, Users, ArrowLeft } from 'lucide-react';
import { Select } from './ui/Select';

interface AnalyticsSummary {
  totalSent: number;
  totalSentDeltaPct?: number; // e.g. 0.12 = +12%
  avgClickRate: number; // 0-1
  avgClickDeltaPct?: number;
  subscriberGrowth: number;
  subscriberGrowthDeltaPct?: number;
}

interface AnalyticsViewProps {
  data: ChartData[];
  onBack?: () => void;
  summary?: AnalyticsSummary;
}

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ data, onBack, summary }) => {
  const [range, setRange] = React.useState<'30d' | 'qtd' | 'ytd'>('30d');
  const totalSent = summary?.totalSent ?? 1_200_000;
  const totalSentDelta = summary?.totalSentDeltaPct ?? 0.12;
  const avgClickRate = summary?.avgClickRate ?? 0.048;
  const avgClickDelta = summary?.avgClickDeltaPct ?? -0.004;
  const subscriberGrowth = summary?.subscriberGrowth ?? 2450;
  const subscriberGrowthDelta = summary?.subscriberGrowthDeltaPct ?? 0.081;

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const signedPct = (n: number) => `${n >= 0 ? '' : '-'}${Math.abs(n * 100).toFixed(1)}%`;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          {onBack && (
            <button 
              onClick={onBack}
              className="p-2 hover:bg-slate-200 rounded-full text-slate-600 transition-colors"
              title="Go Back"
            >
              <ArrowLeft className="app-icon w-5 h-5" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Analytics</h1>
            <p className="text-slate-500 text-sm mt-1">Deep dive into your campaign performance metrics.</p>
          </div>
        </div>
        <div className="w-44">
          <Select<'30d' | 'qtd' | 'ytd'>
            value={range}
            onChange={setRange}
            options={[
              { value: '30d', label: 'Last 30 Days' },
              { value: 'qtd', label: 'Last Quarter' },
              { value: 'ytd', label: 'Year to Date' },
            ]}
          />
        </div>
      </div>

      {/* Top Level Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-sky-50 rounded-lg text-sky-700 icon-inherit">
              <Mail className="app-icon w-5 h-5" />
            </div>
            <h3 className="text-slate-500 font-medium text-sm">Total Sent</h3>
          </div>
          <div className="flex items-baseline gap-2">
            <h2 className="text-3xl font-bold text-slate-800">{totalSent >= 1_000_000 ? `${(totalSent / 1_000_000).toFixed(1)}M` : totalSent.toLocaleString()}</h2>
            <span className={`flex items-center text-sm font-medium icon-inherit ${totalSentDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {totalSentDelta >= 0 ? <ArrowUpRight className="app-icon w-4 h-4" /> : <ArrowDownRight className="app-icon w-4 h-4" />}
              {signedPct(totalSentDelta)}
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-sky-50 rounded-lg text-sky-700 icon-inherit">
              <MousePointer className="app-icon w-5 h-5" />
            </div>
            <h3 className="text-slate-500 font-medium text-sm">Avg. Click Rate</h3>
          </div>
          <div className="flex items-baseline gap-2">
             <h2 className="text-3xl font-bold text-slate-800">{pct(avgClickRate)}</h2>
             <span className={`flex items-center text-sm font-medium icon-inherit ${avgClickDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {avgClickDelta >= 0 ? <ArrowUpRight className="app-icon w-4 h-4" /> : <ArrowDownRight className="app-icon w-4 h-4" />}
              {signedPct(avgClickDelta)}
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-sky-50 rounded-lg text-sky-700 icon-inherit">
              <Users className="app-icon w-5 h-5" />
            </div>
             <h3 className="text-slate-500 font-medium text-sm">Subscriber Growth</h3>
          </div>
          <div className="flex items-baseline gap-2">
             <h2 className="text-3xl font-bold text-slate-800">{subscriberGrowth >= 0 ? `+${subscriberGrowth.toLocaleString()}` : subscriberGrowth.toLocaleString()}</h2>
             <span className={`flex items-center text-sm font-medium icon-inherit ${subscriberGrowthDelta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {subscriberGrowthDelta >= 0 ? <ArrowUpRight className="app-icon w-4 h-4" /> : <ArrowDownRight className="app-icon w-4 h-4" />}
              {signedPct(subscriberGrowthDelta)}
            </span>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Engagement Over Time */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-6">Engagement Trends</h3>
          <div className="h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
               <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                 <defs>
                   <linearGradient id="colorEngagement" x1="0" y1="0" x2="0" y2="1">
                     <stop offset="5%" stopColor="#0284c7" stopOpacity={0.25}/>
                     <stop offset="95%" stopColor="#0284c7" stopOpacity={0}/>
                   </linearGradient>
                 </defs>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                 <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                 <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                 <Area type="monotone" dataKey="opens" stroke="#0284c7" strokeWidth={2} fillOpacity={1} fill="url(#colorEngagement)" />
                 <Area type="monotone" dataKey="clicks" stroke="#0ea5e9" strokeWidth={2} fillOpacity={0} />
               </AreaChart>
             </ResponsiveContainer>
          </div>
        </div>

        {/* Conversion Funnel */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-6">Conversion Volume</h3>
          <div className="h-[300px]">
             <ResponsiveContainer width="100%" height="100%">
               <BarChart data={data}>
                 <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                 <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} dy={10} />
                 <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                 <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                 <Bar dataKey="conversions" fill="#0284c7" radius={[4, 4, 0, 0]} />
               </BarChart>
             </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;