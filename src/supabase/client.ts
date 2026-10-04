import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill both.',
  );
}

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * supabase-js sets no timeout of its own. A request that never settles would
 * hold the sync lock for good, and Sign out, Delete all and Restore would wait
 * on it forever. Aborting fails that sync instead; the next trigger retries.
 */
const fetchWithTimeout: typeof fetch = (input, init) => {
  // AbortSignal.timeout needs Chromium 103 and AbortSignal.any 116. An older
  // Android WebView goes without the timeout rather than failing every request.
  if (typeof AbortSignal.timeout !== 'function') return fetch(input, init);
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  if (!init?.signal) return fetch(input, { ...init, signal: timeout });
  if (typeof AbortSignal.any !== 'function') return fetch(input, init);
  return fetch(input, { ...init, signal: AbortSignal.any([init.signal, timeout]) });
};

export const supabase = createClient(url, anonKey, {
  global: { fetch: fetchWithTimeout },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // No magic links, so there is no callback URL to parse.
    detectSessionInUrl: false,
  },
});
