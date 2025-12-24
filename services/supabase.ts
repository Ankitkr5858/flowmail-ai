import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function envString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function envFromGlobalProcess(key: string): string {
  // In browsers (Netlify), `process` is not defined. Access it safely via globalThis.
  const p = (globalThis as any)?.process;
  return envString(p?.env?.[key]);
}

export function getSupabaseUrl(): string {
  // Prefer Vite env (must be accessed directly so Vite can statically replace it)
  const url = envString(import.meta.env.VITE_SUPABASE_URL);
  return url || envFromGlobalProcess('VITE_SUPABASE_URL');
}

export function getSupabaseAnonKey(): string {
  const key = envString(import.meta.env.VITE_SUPABASE_ANON_KEY);
  return key || envFromGlobalProcess('VITE_SUPABASE_ANON_KEY');
}

export function getWorkspaceId(): string {
  const ws = envString(import.meta.env.VITE_WORKSPACE_ID) || envFromGlobalProcess('VITE_WORKSPACE_ID');
  return ws || 'default';
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (cached) return cached;
  cached = createClient(getSupabaseUrl(), getSupabaseAnonKey());
  return cached;
}


