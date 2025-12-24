import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function envString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function getSupabaseUrl(): string {
  // Prefer Vite env
  const url = envString((import.meta as any)?.env?.VITE_SUPABASE_URL);
  if (url) return url;
  // Fallback if injected via vite `define`
  return envString((process as any)?.env?.VITE_SUPABASE_URL);
}

export function getSupabaseAnonKey(): string {
  const key = envString((import.meta as any)?.env?.VITE_SUPABASE_ANON_KEY);
  if (key) return key;
  return envString((process as any)?.env?.VITE_SUPABASE_ANON_KEY);
}

export function getWorkspaceId(): string {
  const ws = envString((import.meta as any)?.env?.VITE_WORKSPACE_ID) || envString((process as any)?.env?.VITE_WORKSPACE_ID);
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


