import { seedExercises } from '../db/seed';
import { ensureWeekPlan } from '../features/plan/planRepo';
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
  return seeded > 0 || Boolean(plan?.created);
}
