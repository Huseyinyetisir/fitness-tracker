import { supabase } from '../supabase/client';
import type { PushClient } from './push';
import type { PullClient } from './pull';

/**
 * The real Supabase-backed sync client.
 *
 * Deliberately separate from engine.ts. `../supabase/client` throws at module
 * load when VITE_SUPABASE_* are absent, so importing it from the engine would
 * make the sync tests depend on a gitignored .env file. The engine takes its
 * client as a parameter; only the UI reaches for this concrete one.
 */
export const supabaseSyncClient: PushClient & PullClient = {
  async upsert(table, rows) {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    return { error: error ? new Error(error.message) : null };
  },

  async select(table, since) {
    let query = supabase.from(table).select('*');
    if (since) query = query.gte('server_updated_at', since);
    const { data, error } = await query.order('server_updated_at', { ascending: true });
    return {
      rows: (data ?? []) as never[],
      error: error ? new Error(error.message) : null,
    };
  },
};
