import { db } from '../../db/schema';
import { insertRow, updateRow } from '../../db/repo';
import { hasCompletedSync } from '../../db/syncState';
import { deterministicId } from '../../lib/uuidv5';
import type { Local, UUID, UserPrefs } from '../../types/domain';

export type Prefs = Pick<UserPrefs, 'rest_seconds_default' | 'vibration' | 'theme'>;

export const DEFAULT_PREFS: Prefs = { rest_seconds_default: 120, vibration: true, theme: 'dark' };

export function prefsId(userId: string): UUID {
  return deterministicId(`${userId}:user_prefs`);
}

/** The single preferences row, created from the defaults after the first sync. */
export async function ensurePrefs(userId: string): Promise<{ prefs: Local<UserPrefs>; created: boolean } | undefined> {
  if (!(await hasCompletedSync())) return undefined;
  const id = prefsId(userId);
  return db.transaction('rw', db.user_prefs, async () => {
    const existing = await db.user_prefs.get(id);
    if (existing) return { prefs: existing, created: false };
    return { prefs: await insertRow<UserPrefs>('user_prefs', DEFAULT_PREFS, { id, system: true }), created: true };
  });
}

export async function updatePrefs(userId: string, patch: Partial<Prefs>): Promise<void> {
  const ensured = await ensurePrefs(userId);
  if (!ensured) throw new Error('Preferences are available once the first sync completes');
  await updateRow<UserPrefs>('user_prefs', ensured.prefs.id, patch);
}
