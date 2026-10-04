import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import { DEFAULT_PREFS, prefsId, type Prefs } from './prefsRepo';

/** Current preferences, falling back to the defaults until the row exists. */
export function usePrefs(userId: string): Prefs {
  const row = useLiveQuery(async () => (await db.user_prefs.get(prefsId(userId))) ?? null, [userId]);
  return row
    ? { rest_seconds_default: row.rest_seconds_default, vibration: row.vibration, theme: row.theme }
    : DEFAULT_PREFS;
}
