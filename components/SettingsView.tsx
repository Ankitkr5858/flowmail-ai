import React, { useEffect, useMemo, useState } from 'react';
import { User, Bell, Lock, CreditCard, Save } from 'lucide-react';
import { useAuth } from '../store/AuthStore';
import { getSupabase, getWorkspaceId, isSupabaseConfigured } from '../services/supabase';

const SettingsView: React.FC = () => {
  const { state: authState } = useAuth();
  const [tab, setTab] = useState<'profile' | 'notifications' | 'security' | 'billing'>('profile');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const user = authState.user;
  const userEmail = user?.email ?? '';
  const userMeta = (user?.user_metadata ?? {}) as any;

  const [firstName, setFirstName] = useState<string>('');
  const [lastName, setLastName] = useState<string>('');

  const [companyName, setCompanyName] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('UTC');
  const [defaultFromEmail, setDefaultFromEmail] = useState<string>('jimmy@peremis.com');
  const [teamNotifyEmail, setTeamNotifyEmail] = useState<string>('jimmy@peremis.com');

  const workspaceId = useMemo(() => getWorkspaceId() || 'default', []);

  const fmtErr = (e: unknown): string => {
    if (e instanceof Error) return e.message;
    // Supabase/PostgREST errors are often plain objects
    const anyE = e as any;
    const msg = typeof anyE?.message === 'string' ? anyE.message : '';
    const details = typeof anyE?.details === 'string' ? anyE.details : '';
    const hint = typeof anyE?.hint === 'string' ? anyE.hint : '';
    const code = typeof anyE?.code === 'string' ? anyE.code : '';
    const parts = [msg, details, hint].filter(Boolean);
    if (parts.length > 0) return `${parts.join(' | ')}${code ? ` (code: ${code})` : ''}`;
    try { return JSON.stringify(e); } catch { return String(e); }
  };

  useEffect(() => {
    setFirstName(String(userMeta?.first_name ?? userMeta?.given_name ?? ''));
    setLastName(String(userMeta?.last_name ?? userMeta?.family_name ?? ''));
  }, [userMeta?.first_name, userMeta?.given_name, userMeta?.last_name, userMeta?.family_name]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isSupabaseConfigured()) return;
      if (!user) return;
      const sb = getSupabase();
      if (!sb) return;
      try {
        setMessage(null);
        const { data, error } = await sb
          .from('workspace_settings')
          .select('company_name,timezone,default_from_email,team_notify_email')
          .eq('workspace_id', workspaceId)
          .maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        if (data) {
          setCompanyName(String((data as any).company_name ?? ''));
          setTimezone(String((data as any).timezone ?? 'UTC'));
          setDefaultFromEmail(String((data as any).default_from_email ?? 'jimmy@peremis.com'));
          setTeamNotifyEmail(String((data as any).team_notify_email ?? 'jimmy@peremis.com'));
        }
      } catch (e) {
        if (!cancelled) setMessage(`Failed to load settings: ${fmtErr(e)}`);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [user, workspaceId]);

  const save = async () => {
    setMessage(null);
    if (!isSupabaseConfigured()) {
      setMessage('Supabase is not configured.');
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      setMessage('Supabase is not configured.');
      return;
    }
    try {
      setBusy(true);
      // Profile (auth user metadata)
      if (user && tab === 'profile') {
        const { error } = await sb.auth.updateUser({ data: { first_name: firstName, last_name: lastName } });
        if (error) throw error;
      }
      // Workspace settings table
      if (user && (tab === 'profile' || tab === 'notifications' || tab === 'security')) {
        const { error } = await sb.from('workspace_settings').upsert({
          workspace_id: workspaceId,
          company_name: companyName || null,
          timezone: timezone || null,
          default_from_email: defaultFromEmail || null,
          team_notify_email: teamNotifyEmail || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id' });
        if (error) throw error;
      }
      setMessage('Saved.');
    } catch (e) {
      setMessage(fmtErr(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your account preferences and workspace settings.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Settings Navigation */}
        <div className="space-y-1">
          <button
            onClick={() => setTab('profile')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${tab === 'profile' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
          >
            <User className="w-4 h-4" /> Profile
          </button>
          <button
            onClick={() => setTab('notifications')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${tab === 'notifications' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
          >
            <Bell className="w-4 h-4" /> Notifications
          </button>
          <button
            onClick={() => setTab('security')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${tab === 'security' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
          >
            <Lock className="w-4 h-4" /> Security & API
          </button>
          <button
            onClick={() => setTab('billing')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${tab === 'billing' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
          >
            <CreditCard className="w-4 h-4" /> Billing
          </button>
        </div>

        {/* Main Settings Form */}
        <div className="md:col-span-2 space-y-6">
          {!isSupabaseConfigured() && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 text-sm">
              Supabase is not configured, so Settings will show demo values.
            </div>
          )}
          {authState.status !== 'signed_in' && isSupabaseConfigured() && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-900 text-sm">
              Sign in to view and edit real settings.
            </div>
          )}
          {message && (
            <div className={`rounded-xl p-4 text-sm ${message === 'Saved.' ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-slate-50 border border-slate-200 text-slate-800'}`}>
              {message}
            </div>
          )}
          
          {tab === 'profile' && (
            <>
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-3">Personal Information</h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">First Name</label>
                      <input value={firstName} onChange={(e) => setFirstName(e.target.value)} type="text" className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Last Name</label>
                      <input value={lastName} onChange={(e) => setLastName(e.target.value)} type="text" className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                    <input type="email" value={userEmail || ''} readOnly className="w-full bg-slate-50 text-slate-700 border border-slate-300 rounded-lg px-3 py-2 outline-none" />
                    <div className="text-xs text-slate-500 mt-1">Email comes from your Google/Supabase account.</div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-3">Workspace & Preferences</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Company Name</label>
                    <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} type="text" className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
                      <input value={timezone} onChange={(e) => setTimezone(e.target.value)} type="text" className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="UTC" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Default From Email</label>
                      <input value={defaultFromEmail} onChange={(e) => setDefaultFromEmail(e.target.value)} type="email" className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'notifications' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-3">Notifications</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Team notification email</label>
                  <input value={teamNotifyEmail} onChange={(e) => setTeamNotifyEmail(e.target.value)} type="email" className="w-full bg-white text-slate-700 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none" />
                  <div className="text-xs text-slate-500 mt-1">Used by automation “Notify team” actions.</div>
                </div>
              </div>
            </div>
          )}

          {tab === 'security' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-3">Security & API</h2>
              <div className="space-y-3 text-sm text-slate-700">
                <div><span className="font-semibold">Supabase configured:</span> {isSupabaseConfigured() ? 'Yes' : 'No'}</div>
                <div><span className="font-semibold">Workspace:</span> {workspaceId}</div>
                <div className="text-xs text-slate-500">
                  Server secrets (SMTP gateway token, service role key, unsubscribe signing key) are stored in Supabase/VPS and cannot be shown in the browser.
                </div>
              </div>
            </div>
          )}

          {tab === 'billing' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-3">Billing</h2>
              <div className="text-sm text-slate-600">
                Billing is not implemented in this starter. (Connect Stripe here in production.)
              </div>
            </div>
          )}

          <div className="flex justify-end">
             <button
               onClick={() => { void save(); }}
               disabled={busy || authState.status !== 'signed_in'}
               className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 shadow-sm transition-colors"
             >
               <Save className="w-4 h-4" />
               {busy ? 'Saving…' : 'Save Changes'}
             </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default SettingsView;
