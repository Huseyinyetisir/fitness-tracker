import { db } from '../db/schema';
import type { UUID } from '../types/domain';
import { pendingCount } from './engine';
import { SYNCED_TABLES } from './tables';

/** The slice of the Supabase client a wipe needs. Narrow for testability. */
export interface WipeClient {
  deleteAll(table: string, userId: UUID): Promise<{ error: Error | null }>;
}

/** Empties every local table, sync bookkeeping included, so the device is as if freshly installed. */
export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
}

/**
 * Clears the device for signing out, unless it holds changes the server has
 * not seen and `force` is false. Returns how many such changes there are, so
 * the caller can warn — counted here rather than taken from the sync status,
 * which can lag behind a local write, and in the same transaction as the
 * clear, so no write lands between the two.
 */
export async function clearLocalDataUnlessPending(force: boolean): Promise<number> {
  return db.transaction('rw', db.tables, async () => {
    if (!force) {
      const pending = await pendingCount();
      if (pending > 0) return pending;
    }
    await clearLocalData();
    return 0;
  });
}

/**
 * Deletes the account's data everywhere: hard deletes on the server, then
 * this device. The one path in the app that does not soft-delete.
 *
 * Children go before parents — the reverse of push order — because the
 * foreign keys have no cascade. The device is cleared only after every server
 * delete succeeds, so a failure part-way leaves something to retry from.
 *
 * Other signed-in devices keep their local copy until they sign out; they
 * have no tombstones to learn of a hard delete from.
 */
export async function wipeAccount(client: WipeClient, userId: UUID): Promise<void> {
  for (const name of [...SYNCED_TABLES].reverse()) {
    const { error } = await client.deleteAll(name, userId);
    if (error) throw error;
  }
  await clearLocalData();
}
