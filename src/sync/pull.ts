import type { BaseRow, ISODateTime, Local } from '../types/domain';
import { db, type SyncedTableName } from '../db/schema';
import { mergeRow } from './merge';

/** The slice of the Supabase client pull needs. Narrow for testability. */
export interface PullClient {
  select(
    table: string,
    since: ISODateTime | null,
  ): Promise<{ rows: BaseRow[]; error: Error | null }>;
}

export async function getWatermark(name: SyncedTableName): Promise<ISODateTime | null> {
  return (await db.sync_meta.get(name))?.watermark ?? null;
}

export async function setWatermark(
  name: SyncedTableName,
  watermark: ISODateTime | null,
): Promise<void> {
  const existing = await db.sync_meta.get(name);
  await db.sync_meta.put({
    table: name,
    watermark,
    last_synced_at: existing?.last_synced_at ?? null,
    last_error: existing?.last_error ?? null,
  });
}

/**
 * Fetches rows changed at or after the watermark and merges each one.
 *
 * The query is `>=` rather than `>`: two rows can share a server_updated_at
 * value, and a strict comparison silently drops the ones written after the
 * watermark was recorded. Re-applying a row is idempotent, so the overlap
 * costs one redundant row per sync and removes a whole class of data loss.
 *
 * The watermark advances only after every row in the batch is applied, so an
 * interrupted pull is retried from where it left off rather than skipped.
 */
export async function pullTable(
  client: PullClient,
  name: SyncedTableName,
): Promise<number> {
  const since = await getWatermark(name);
  const { rows, error } = await client.select(name, since);
  if (error) throw error;
  if (rows.length === 0) return 0;

  const table = db[name] as unknown as import('dexie').Table<Local<BaseRow>, string>;

  await db.transaction('rw', table, async () => {
    for (const remote of rows) {
      const existing = await table.get(remote.id);
      const merged = mergeRow(existing, remote);
      if (merged) await table.put(merged);
    }
  });

  const highest = rows.reduce<ISODateTime | null>(
    (max, r) => (r.server_updated_at && (!max || r.server_updated_at > max) ? r.server_updated_at : max),
    since,
  );
  await setWatermark(name, highest);

  return rows.length;
}
