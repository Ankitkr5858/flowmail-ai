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

  const url = `${baseUrl}/functions/v1/${name}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anon,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch (e) {
    // Browser "Failed to fetch" typically indicates:
    // - Edge Function not deployed (preflight fails)
    // - Wrong SUPABASE URL
    // - Network/CORS issues
    const msg = e instanceof Error ? e.message : String(e);
    const hint =
      msg.toLowerCase().includes('failed to fetch')
        ? `Could not reach Supabase Edge Function "${name}".\n\n` +
          `Most common causes:\n` +
          `- The function isn't deployed yet (run: supabase functions deploy ${name})\n` +
          `- VITE_SUPABASE_URL is wrong\n` +
          `- Network/CORS blocks the request\n\n` +
          `URL: ${url}`
        : `Failed to call Edge Function "${name}": ${msg}\nURL: ${url}`;
    throw new Error(hint);
  }

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


