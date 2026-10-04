import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { markSynced, resetDb } from '../test/fixtures';
import { bodyRow, sessionRow } from '../test/rows';
import { clearLocalData, wipeAccount, type WipeClient } from './wipe';

function fakeClient(failOn?: string): WipeClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async deleteAll(table, userId) {
      calls.push(`${table}:${userId}`);
      return { error: table === failOn ? new Error(`cannot delete ${table}`) : null };
    },
  };
}

describe('wipe', () => {
  beforeEach(async () => {
    await resetDb();
    await markSynced();
    await db.sessions.put(sessionRow('s1'));
    await db.body_metrics.put(bodyRow('b1', '2026-10-01'));
  });

  it('deletes server rows children first, then empties every local table', async () => {
    const client = fakeClient();
    await wipeAccount(client, 'user-1');

    expect(client.calls[0]).toBe('user_prefs:user-1');
    expect(client.calls.indexOf('set_entries:user-1')).toBeLessThan(client.calls.indexOf('session_exercises:user-1'));
    expect(client.calls.indexOf('session_exercises:user-1')).toBeLessThan(client.calls.indexOf('sessions:user-1'));
    expect(client.calls.at(-1)).toBe('exercises:user-1');
    expect(client.calls).toHaveLength(12);

    expect(await db.sessions.count()).toBe(0);
    expect(await db.body_metrics.count()).toBe(0);
    expect(await db.sync_meta.count()).toBe(0);
  });

  it('leaves the device untouched when a server delete fails', async () => {
    await expect(wipeAccount(fakeClient('sessions'), 'user-1')).rejects.toThrow('cannot delete sessions');
    expect(await db.sessions.count()).toBe(1);
    expect(await db.sync_meta.count()).toBe(1);
  });

  it('clears local data on its own, for signing out', async () => {
    await clearLocalData();
    expect(await db.sessions.count()).toBe(0);
    expect(await db.sync_meta.count()).toBe(0);
  });
});
