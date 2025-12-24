import React, { useEffect, useMemo, useState } from 'react';
import { X, Save } from 'lucide-react';
import type { Contact } from '../types';
import { Select } from './ui/Select';

interface ContactEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (patch: Partial<Contact>) => void;
  initialContact?: Contact | null;
}

const ContactEditor: React.FC<ContactEditorProps> = ({ isOpen, onClose, onSave, initialContact }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [location, setLocation] = useState('');
  const [website, setWebsite] = useState('');
  const [timezone, setTimezone] = useState('GMT-8');
  const [lifecycleStage, setLifecycleStage] = useState<'cold' | 'lead' | 'mql' | 'customer' | 'churned'>('lead');
  const [temperature, setTemperature] = useState<'cold' | 'warm' | 'hot'>('warm');
  const [status, setStatus] = useState<'Subscribed' | 'Unsubscribed' | 'Bounced'>('Subscribed');
  const [tagsText, setTagsText] = useState('');
  const [listsText, setListsText] = useState('');
  const [acquisitionSource, setAcquisitionSource] = useState<Contact['acquisitionSource']>('Manual');

  const isEditing = !!initialContact;
  const title = isEditing ? 'Edit Contact' : 'Create Contact';

  useEffect(() => {
    if (!isOpen) return;
    const c = initialContact;
    setFirstName(c?.firstName ?? (c?.name?.split(' ')[0] ?? ''));
    setLastName(c?.lastName ?? (c?.name?.split(' ').slice(1).join(' ') ?? ''));
    setEmail(c?.email ?? '');
    setPhone(c?.phone ?? '');
    setCompany(c?.company ?? '');
    setJobTitle(c?.jobTitle ?? '');
    setLocation(c?.location ?? '');
    setWebsite(c?.website ?? '');
    setTimezone(c?.timezone ?? 'GMT-8');
    const stage = String(c?.lifecycleStage ?? 'lead').toLowerCase();
    setLifecycleStage((stage === 'subscriber' ? 'lead' : stage) as any);
    setTemperature(String(c?.temperature ?? 'warm').toLowerCase() as any);
    setStatus(c?.status ?? 'Subscribed');
    setTagsText((c?.tags ?? []).join(', '));
    setListsText((c?.lists ?? []).join(', '));
    setAcquisitionSource(c?.acquisitionSource ?? 'Manual');
  }, [isOpen, initialContact]);

  const canSave = useMemo(() => {
    return email.trim().length > 3 && (firstName.trim().length > 0 || lastName.trim().length > 0);
  }, [email, firstName, lastName]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!canSave) return;
    const tags = tagsText
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    const lists = listsText
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    const name = `${firstName} ${lastName}`.trim();

    onSave({
      name,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      company: company.trim() || undefined,
      jobTitle: jobTitle.trim() || undefined,
      location: location.trim() || undefined,
      website: website.trim() || undefined,
      timezone,
      lifecycleStage,
      temperature,
      status,
      tags,
      lists,
      acquisitionSource,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="font-semibold text-lg text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 icon-inherit">
            <X className="app-icon w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
              <input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Lifecycle Stage</label>
              <Select<'cold' | 'lead' | 'mql' | 'customer' | 'churned'>
                value={lifecycleStage}
                onChange={(v) => setLifecycleStage(v)}
                options={[
                  { value: 'cold', label: 'cold' },
                  { value: 'lead', label: 'lead' },
                  { value: 'mql', label: 'mql' },
                  { value: 'customer', label: 'customer' },
                  { value: 'churned', label: 'churned' },
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Temperature</label>
              <Select<'cold' | 'warm' | 'hot'>
                value={temperature}
                onChange={(v) => setTemperature(v)}
                options={[
                  { value: 'cold', label: 'cold' },
                  { value: 'warm', label: 'warm' },
                  { value: 'hot', label: 'hot' },
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <Select<'Subscribed' | 'Unsubscribed' | 'Bounced'>
                value={status}
                onChange={(v) => setStatus(v)}
                options={[
                  { value: 'Subscribed', label: 'Subscribed' },
                  { value: 'Unsubscribed', label: 'Unsubscribed' },
                  { value: 'Bounced', label: 'Bounced' },
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Acquisition Source</label>
              <Select<'manual' | 'website_form' | 'imported_csv' | 'api' | 'referral' | 'facebook_ad' | 'landing_page'>
                value={(acquisitionSource ?? 'Manual') as any}
                onChange={(v) => setAcquisitionSource(v as any)}
                options={[
                  { value: 'manual', label: 'manual' },
                  { value: 'website_form', label: 'website_form' },
                  { value: 'imported_csv', label: 'imported_csv' },
                  { value: 'api', label: 'api' },
                  { value: 'referral', label: 'referral' },
                  { value: 'facebook_ad', label: 'facebook_ad' },
                  { value: 'landing_page', label: 'landing_page' },
                ]}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Tags (comma-separated)</label>
              <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Lists (comma-separated)</label>
              <input value={listsText} onChange={(e) => setListsText(e.target.value)} className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Company</label>
              <input value={company} onChange={(e) => setCompany(e.target.value)} className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Job Title</label>
              <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Website</label>
              <input value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 outline-none" />
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed icon-on-solid"
          >
            <Save className="app-icon w-4 h-4" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContactEditor;


