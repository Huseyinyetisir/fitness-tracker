import { db } from '../db/schema';

export const USER = 'user-1';

export async function resetDb(): Promise<void> {
  await db.delete();
  await db.open();
}

/** Records a completed sync, which first-time setup waits for. */
export async function markSynced(): Promise<void> {
  await db.sync_meta.put({
    table: 'exercises',
    watermark: null,
    last_synced_at: '2026-10-01T06:00:00.000Z',
    last_error: null,
  });
}
