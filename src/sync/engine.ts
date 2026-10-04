import type { UUID } from '../types/domain';
import { db } from '../db/schema';
import { dirtyRows } from '../db/repo';
import { nowISO } from '../lib/time';
import { SYNCED_TABLES } from './tables';
import { pushTable, type PushClient } from './push';
import { pullTable, type PullClient } from './pull';
import type { SyncResult, SyncStatus } from './types';

export async function pendingCount(): Promise<number> {
  let total = 0;
  for (const name of SYNCED_TABLES) {
    total += (await dirtyRows(name)).length;
  }
  return total;
}

async function recordMeta(error: string | null): Promise<void> {
  const ts = nowISO();
  for (const name of SYNCED_TABLES) {
    const existing = await db.sync_meta.get(name);
    await db.sync_meta.put({
      table: name,
      watermark: existing?.watermark ?? null,
      last_synced_at: error ? (existing?.last_synced_at ?? null) : ts,
      last_error: error,
    });
  }
}

/**
 * Push first, then pull. Pushing first means local work reaches the server
 * before any remote row can win a merge against it — otherwise an offline
 * session could be overwritten by a stale remote copy on its first sync.
 */
export async function syncAll(
  client: PushClient & PullClient,
  userId: UUID,
): Promise<SyncResult> {
  try {
    let pushed = 0;
    for (const name of SYNCED_TABLES) {
      pushed += await pushTable(client, name, userId);
    }

    // Pulls run concurrently. Unlike pushes — where the server's foreign keys
    // require parents before children — pulled rows land in Dexie, which has
    // no foreign keys, and each table keeps its own watermark. Sequential
    // pulls cost one round trip per table: ~7s per sync against the real
    // project, almost all of it waiting.
    const pulledCounts = await Promise.all(
      SYNCED_TABLES.map((name) => pullTable(client, name)),
    );
    const pulled = pulledCounts.reduce((sum, n) => sum + n, 0);

    await recordMeta(null);
    return { pushed, pulled };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await recordMeta(message);
    throw e;
  }
}

export async function currentStatus(): Promise<SyncStatus> {
  const meta = await db.sync_meta.get('exercises');
  return {
    phase: meta?.last_error ? 'error' : 'idle',
    pendingCount: await pendingCount(),
    lastSyncedAt: meta?.last_synced_at ?? null,
    error: meta?.last_error ?? null,
  };
}
