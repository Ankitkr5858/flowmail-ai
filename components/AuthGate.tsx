import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../store/AuthStore';
import LoginView from './LoginView';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { state, actions } = useAuth();
  const loc = useLocation();

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
    // Show a real route for login.
    if (loc.pathname === '/login') return <LoginView />;
    return <Navigate to="/login" replace />;
  }

  // If already signed in, keep /login clean.
  if (loc.pathname === '/login') return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}


