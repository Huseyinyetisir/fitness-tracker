import { seedExercises } from '../db/seed';
import { ensureWeekPlan } from '../features/plan/planRepo';
import { ensurePrefs } from '../features/settings/prefsRepo';
import type { ISODate } from '../types/domain';

/**
 * One-time setup that must wait for the first completed sync. Each step is
 * idempotent and runs after every sync, so a fresh install picks up the
 * account's existing rows first and only creates what is genuinely missing.
 *
 * Returns true if anything was written that should be pushed now.
 */
export async function bootstrapAfterSync(userId: string, todayDate: ISODate): Promise<boolean> {
  const seeded = await seedExercises();
  const plan = await ensureWeekPlan(userId, todayDate);
  const prefs = await ensurePrefs(userId);
  return seeded > 0 || Boolean(plan?.created) || Boolean(prefs?.created);
}
