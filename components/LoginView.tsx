import React from 'react';
import { Mail } from 'lucide-react';
import { useAuth } from '../store/AuthStore';
import { isSupabaseConfigured } from '../services/supabase';

export default function LoginView() {
  const { state, actions } = useAuth();
  const supaOk = isSupabaseConfigured();
  const canSignIn = supaOk && state.status !== 'disabled';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 w-full max-w-md">
        <div className="flex items-center gap-2 text-slate-900">
          <Mail className="app-icon w-6 h-6" />
          <div>
            <div className="text-xl font-bold">FlowMail</div>
            <div className="text-xs text-slate-500 font-medium">CRM • Campaigns • Automation</div>
          </div>
        </div>

        <div className="mt-6">
          {!canSignIn ? (
            <div className="text-sm text-slate-600">
              This app isn’t connected yet. Set <span className="font-semibold">VITE_SUPABASE_URL</span> and <span className="font-semibold">VITE_SUPABASE_ANON_KEY</span> in your env and restart the dev server.
            </div>
          ) : (
            <div className="text-sm text-slate-600">Sign in to access your workspace.</div>
          )}
          <button
            type="button"
            disabled={!canSignIn}
            onClick={() => void actions.signInWithGoogle()}
            className="mt-4 w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            Continue with Google
          </button>
          <div className="text-xs text-slate-500 mt-3">
            Ensure Supabase Auth redirect URLs include <span className="font-semibold text-slate-700">{window.location.origin}</span>.
          </div>
        </div>
      </div>
    </div>
  );
}


