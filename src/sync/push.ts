import type { BaseRow, Local, UUID } from '../types/domain';
import type { SyncedTableName } from '../db/schema';
import { clearDirty, dirtyRows } from '../db/repo';

/** Batch size. Keeps each request well inside Supabase's payload limits. */
export const PUSH_BATCH_SIZE = 100;

/** The slice of the Supabase client push needs. Narrow for testability. */
export interface PushClient {
  upsert(table: string, rows: BaseRow[]): Promise<{ error: Error | null }>;
}

/** Removes local-only fields and stamps ownership before upload. */
export function stripLocal<T extends BaseRow>(row: Local<T>, userId?: UUID): T {
  const { _dirty: _d, _deleted: _del, ...rest } = row;
  // Omit<Local<T>, '_dirty' | '_deleted'> is not provably T — T could itself
  // declare them — so the compiler needs the widening step spelled out.
  const out = rest as unknown as T;
  return userId ? { ...out, user_id: userId } : out;
}

/**
 * Uploads every dirty row in one table. Dirty flags are cleared only after the
 * server acknowledges the batch, so a failed push leaves the rows queued and
 * the next attempt retries them.
 */
export async function pushTable(
  client: PushClient,
  name: SyncedTableName,
  userId: UUID,
): Promise<number> {
  const rows = await dirtyRows(name);
  if (rows.length === 0) return 0;

  let pushed = 0;
  for (let i = 0; i < rows.length; i += PUSH_BATCH_SIZE) {
    const batch = rows.slice(i, i + PUSH_BATCH_SIZE);
    const payload = batch.map((r) => stripLocal(r, userId));

    const { error } = await client.upsert(name, payload);
    if (error) throw error;

    await clearDirty(
      name,
      batch.map((r) => ({ id: r.id, updated_at: r.updated_at })),
    );
    pushed += batch.length;
  }

  return pushed;
}
