import React, { useMemo } from 'react';
import { ArrowLeft, Mail, Pencil, GitBranch, MapPin, Building2, Globe, Phone } from 'lucide-react';
import { Pie, PieChart, Cell, ResponsiveContainer } from 'recharts';
import type { Contact } from '../types';

interface ContactDetailViewProps {
  contact: Contact;
  onBack: () => void;
  onEdit: () => void;
  onSendEmail: () => void;
  onAddToWorkflow: () => void;
}

const ContactDetailView: React.FC<ContactDetailViewProps> = ({ contact, onBack, onEdit, onSendEmail, onAddToWorkflow }) => {
  const score = Math.min(100, Math.max(0, contact.leadScore ?? 0));
  const scoreData = useMemo(() => ([
    { name: 'Score', value: score },
    { name: 'Remaining', value: 100 - score },
  ]), [score]);

  const events = (contact.events ?? []).slice().sort((a, b) => (b.occurredAt.localeCompare(a.occurredAt)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-full text-slate-600 transition-colors" title="Back">
            <ArrowLeft className="app-icon w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Contact Detail View</h1>
            <p className="text-slate-500 text-sm mt-1">Home <span className="mx-1">›</span> Contacts <span className="mx-1">›</span> {contact.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onEdit} className="border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors">
            <Pencil className="app-icon w-4 h-4" />
            Edit Contact
          </button>
          <button onClick={onSendEmail} className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm icon-on-solid">
            <Mail className="app-icon w-4 h-4" />
            Send Email
          </button>
          <button onClick={onAddToWorkflow} className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-sm">
            <GitBranch className="app-icon w-4 h-4" />
            Add to Workflow
          </button>
        </div>
      </div>

      {/* Header card */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white border border-slate-200 flex items-center justify-center text-lg font-bold text-slate-700">
            {(contact.firstName?.[0] ?? contact.name?.[0] ?? 'C').toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-2xl font-bold text-slate-800 truncate">{contact.name}</h2>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                contact.status === 'Subscribed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                contact.status === 'Bounced' ? 'bg-red-50 text-red-700 border-red-200' :
                'bg-slate-50 text-slate-600 border-slate-200'
              }`}>
                {contact.status}
              </span>
            </div>
            <p className="text-slate-600 text-sm mt-1 truncate">{contact.email}</p>
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-600">
              {contact.phone && (
                <div className="flex items-center gap-2"><Phone className="app-icon app-icon-muted w-4 h-4" /> {contact.phone}</div>
              )}
              {contact.company && (
                <div className="flex items-center gap-2"><Building2 className="app-icon app-icon-muted w-4 h-4" /> {contact.company}</div>
              )}
              {contact.location && (
                <div className="flex items-center gap-2"><MapPin className="app-icon app-icon-muted w-4 h-4" /> {contact.location}</div>
              )}
              {contact.website && (
                <div className="flex items-center gap-2"><Globe className="app-icon app-icon-muted w-4 h-4" /> {contact.website}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact details */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Contact Details</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-6"><span className="text-slate-500">Full Name</span><span className="text-slate-800 font-medium">{contact.name}</span></div>
            <div className="flex justify-between gap-6"><span className="text-slate-500">Email</span><span className="text-slate-800 font-medium">{contact.email}</span></div>
            <div className="flex justify-between gap-6"><span className="text-slate-500">Phone</span><span className="text-slate-800 font-medium">{contact.phone || '-'}</span></div>
            <div className="flex justify-between gap-6"><span className="text-slate-500">Company</span><span className="text-slate-800 font-medium">{contact.company || '-'}</span></div>
            <div className="flex justify-between gap-6"><span className="text-slate-500">Job Title</span><span className="text-slate-800 font-medium">{contact.jobTitle || '-'}</span></div>
            <div className="flex justify-between gap-6"><span className="text-slate-500">Timezone</span><span className="text-slate-800 font-medium">{contact.timezone || '-'}</span></div>
          </div>
        </div>

        {/* Lead score */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Lead Score</h3>
          <div className="grid grid-cols-2 gap-4 items-center">
            <div className="relative w-full h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={scoreData} innerRadius={52} outerRadius={70} paddingAngle={3} dataKey="value" startAngle={90} endAngle={-270}>
                    <Cell fill="#10b981" strokeWidth={0} />
                    <Cell fill="#e2e8f0" strokeWidth={0} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-slate-800">{score}/100</span>
                <span className="text-xs text-slate-500 font-medium">{score >= 80 ? 'Very Hot Lead' : score >= 50 ? 'Warm Lead' : 'Cold Lead'}</span>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Engagement</span><span className="font-semibold text-slate-800">{Math.min(100, score + 7)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Profile</span><span className="font-semibold text-slate-800">{Math.max(0, score - 7)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Behavior</span><span className="font-semibold text-slate-800">{Math.min(100, score + 3)}</span></div>
            </div>
          </div>
        </div>

        {/* Behavioral data */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Behavioral Data</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Email Opens</span><span className="font-semibold text-slate-800">{contact.events?.filter(e => e.type === 'email_open').length ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Link Clicks</span><span className="font-semibold text-slate-800">{contact.events?.filter(e => e.type === 'link_click').length ?? 0}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Website Visits</span><span className="font-semibold text-slate-800">{Math.max(0, (contact.events?.filter(e => e.type === 'email_open').length ?? 0) * 2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Last Activity</span><span className="font-semibold text-slate-800">{contact.updatedAt ? new Date(contact.updatedAt).toLocaleDateString() : '-'}</span></div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-semibold text-slate-800 mb-4">Key Event Timeline</h3>
        <div className="space-y-4">
          {events.length === 0 && <div className="text-slate-500 text-sm">No events yet.</div>}
          {events.map((e) => (
            <div key={e.id} className="flex gap-4">
              <div className="w-8 flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${
                  e.type === 'purchase' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                  e.type === 'link_click' ? 'bg-sky-50 border-sky-200 text-sky-800' :
                  e.type === 'email_open' ? 'bg-sky-50 border-sky-200 text-sky-700' :
                  'bg-slate-50 border-slate-200 text-slate-700'
                }`}>
                  <span className="text-xs font-bold">{e.type === 'purchase' ? '$' : e.type === 'link_click' ? '↗' : e.type === 'email_open' ? '✉' : '•'}</span>
                </div>
                <div className="flex-1 w-px bg-slate-200 mt-2" />
              </div>
              <div className="flex-1 pb-2">
                <div className="text-sm font-medium text-slate-800">{e.title}</div>
                <div className="text-xs text-slate-500 mt-1">{new Date(e.occurredAt).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ContactDetailView;


