import { supabase } from '../supabase/client';
import type { PushClient } from './push';
import type { PullClient } from './pull';
import { fetchAllPages } from './paginate';
import type { BaseRow } from '../types/domain';

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
    return fetchAllPages<BaseRow>(async (from, to) => {
      let query = supabase.from(table).select('*');
      if (since) query = query.gte('server_updated_at', since);

      const { data, error } = await query
        // server_updated_at alone is not a total order — rows written in the
        // same transaction share it, and without a tiebreak the database may
        // order them differently between requests, so a row can be returned
        // twice or skipped across a page boundary.
        .order('server_updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);

      return {
        rows: (data ?? []) as BaseRow[],
        error: error ? new Error(error.message) : null,
      };
    });
  },
};
