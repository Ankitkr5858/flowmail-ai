import React from 'react';
import { Mail } from 'lucide-react';
import { useAuth } from '../store/AuthStore';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { state, actions } = useAuth();

  if (state.status === 'disabled') return <>{children}</>;

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 w-full max-w-sm text-center">
          <div className="text-lg font-semibold text-slate-900">Loading…</div>
          <div className="text-sm text-slate-600 mt-1">Checking your session.</div>
        </div>
      </div>
    );
  }

  if (state.status === 'signed_out') {
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
            <div className="text-sm text-slate-600">Sign in to access your workspace.</div>
            <button
              type="button"
              onClick={() => void actions.signInWithGoogle()}
              className="mt-4 w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
            >
              Continue with Google
            </button>
            <div className="text-xs text-slate-500 mt-3">
              Redirect URL must include <span className="font-semibold text-slate-700">{window.location.origin}</span> in Supabase Auth settings.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}


