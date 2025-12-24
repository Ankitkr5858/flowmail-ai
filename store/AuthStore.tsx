import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '../services/supabase';

export type AuthStatus = 'disabled' | 'loading' | 'signed_out' | 'signed_in';

export type AuthState = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
};

export type AuthActions = {
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<{ state: AuthState; actions: AuthActions } | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', session: null, user: null });

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState({ status: 'disabled', session: null, user: null });
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      setState({ status: 'disabled', session: null, user: null });
      return;
    }

    let cancelled = false;
    (async () => {
      const { data } = await sb.auth.getSession();
      if (cancelled) return;
      const session = data.session ?? null;
      try {
        if (session?.user?.id) localStorage.setItem('flowmail.ai.workspaceId', session.user.id);
        else localStorage.removeItem('flowmail.ai.workspaceId');
      } catch {}
      setState({ status: session ? 'signed_in' : 'signed_out', session, user: session?.user ?? null });
    })();

    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      try {
        if (session?.user?.id) localStorage.setItem('flowmail.ai.workspaceId', session.user.id);
        else localStorage.removeItem('flowmail.ai.workspaceId');
      } catch {}
      setState({ status: session ? 'signed_in' : 'signed_out', session: session ?? null, user: session?.user ?? null });
    });

    return () => {
      cancelled = true;
      try { sub.subscription.unsubscribe(); } catch {}
    };
  }, []);

  const actions: AuthActions = useMemo(() => {
    return {
      signInWithGoogle: async () => {
        const sb = getSupabase();
        if (!sb) return;
        await sb.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
      },
      signOut: async () => {
        const sb = getSupabase();
        if (!sb) return;
        await sb.auth.signOut();
        try { localStorage.removeItem('flowmail.ai.workspaceId'); } catch {}
        // Hard refresh to ensure all cached app state resets behind RLS.
        window.location.assign(`${window.location.origin}/login`);
      },
    };
  }, []);

  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}


