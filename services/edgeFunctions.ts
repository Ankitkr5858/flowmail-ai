import { getSupabase, getSupabaseAnonKey, getSupabaseUrl } from './supabase';

export async function invokeEdgeFunction<TResponse>(
  name: string,
  body: unknown,
): Promise<TResponse> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase is not configured');

  const baseUrl = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  if (!baseUrl || !anon) throw new Error('Missing Supabase URL/anon key');

  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${baseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anon,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  });

  const text = await res.text();
  const parsed = (() => {
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return { error: text };
    }
  })();

  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === 'object' && 'error' in (parsed as any) && (parsed as any).error)
        ? String((parsed as any).error)
        : `Edge Function ${name} failed (${res.status})`;
    throw new Error(msg);
  }

  return parsed as TResponse;
}


