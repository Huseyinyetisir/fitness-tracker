import { db } from './schema';

/**
 * True once any sync has completed. Rows created before then are minted on a
 * device that has not yet seen the account's existing data — the cause of the
 * duplicate-library bug — so first-time setup waits for this.
 */
export async function hasCompletedSync(): Promise<boolean> {
  return Boolean((await db.sync_meta.get('exercises'))?.last_synced_at);
}
