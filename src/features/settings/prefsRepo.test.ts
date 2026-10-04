import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { isSystemTimestamp } from '../../lib/time';
import { USER, markSynced, resetDb } from '../../test/fixtures';
import { DEFAULT_PREFS, ensurePrefs, prefsId, updatePrefs } from './prefsRepo';

beforeEach(resetDb);

describe('preferences', () => {
  it('wait for the first sync', async () => {
    expect(await ensurePrefs(USER)).toBeUndefined();
    await expect(updatePrefs(USER, { vibration: false })).rejects.toThrow(/first sync/);
  });

  it('start from the defaults, as a system write with a shared id', async () => {
    await markSynced();
    const result = await ensurePrefs(USER);
    expect(result?.created).toBe(true);
    expect(result?.prefs).toMatchObject({ id: prefsId(USER), ...DEFAULT_PREFS });
    expect(isSystemTimestamp(result!.prefs.updated_at)).toBe(true);
  });

  it('are created once', async () => {
    await markSynced();
    await Promise.all([ensurePrefs(USER), ensurePrefs(USER)]);
    expect((await ensurePrefs(USER))?.created).toBe(false);
    expect(await db.user_prefs.count()).toBe(1);
  });

  it('record a change as a user edit', async () => {
    await markSynced();
    await updatePrefs(USER, { rest_seconds_default: 90 });
    const row = await db.user_prefs.get(prefsId(USER));
    expect(row?.rest_seconds_default).toBe(90);
    expect(isSystemTimestamp(row!.updated_at)).toBe(false);
  });
});
