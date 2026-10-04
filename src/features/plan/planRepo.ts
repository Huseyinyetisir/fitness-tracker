import { db } from '../../db/schema';
import { insertRow, updateRow } from '../../db/repo';
import { hasCompletedSync } from '../../db/syncState';
import { deterministicId } from '../../lib/uuidv5';
import type { ISODate, Local, UUID, WeekPlan, WeekPlanDay, Weekday } from '../../types/domain';

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export function defaultPlanId(userId: string): UUID {
  return deterministicId(`${userId}:week_plan:default`);
}

export function defaultPlanDayId(userId: string, weekday: Weekday): UUID {
  return deterministicId(`${userId}:week_plan_day:default:${weekday}`);
}

/**
 * Creates the default plan and its seven rest days if they are missing.
 * The plan starts today: days before it existed are never planned, so they can never read as missed.
 *
 * Deterministic ids mean every device creates the same rows. System
 * timestamps mean those defaults can never overwrite a day the user has set.
 * Like the library seed, this waits for the first completed sync.
 */
export async function ensureWeekPlan(
  userId: string,
  todayDate: ISODate,
): Promise<{ plan: Local<WeekPlan>; created: boolean } | undefined> {
  if (!(await hasCompletedSync())) return undefined;
  const planId = defaultPlanId(userId);

  return db.transaction('rw', [db.week_plans, db.week_plan_days], async () => {
    let created = false;
    let plan = await db.week_plans.get(planId);
    if (!plan) {
      plan = await insertRow<WeekPlan>(
        'week_plans',
        { name: 'My plan', active_from: todayDate },
        { id: planId, system: true },
      );
      created = true;
    }

    for (const weekday of WEEKDAYS) {
      const id = defaultPlanDayId(userId, weekday);
      if (!(await db.week_plan_days.get(id))) {
        await insertRow<WeekPlanDay>(
          'week_plan_days',
          { week_plan_id: planId, weekday, template_id: null },
          { id, system: true },
        );
        created = true;
      }
    }

    return { plan, created };
  });
}

/** The plan in force on a date: the latest live plan whose active_from is on or before it. */
export function pickActivePlan<P extends WeekPlan>(plans: P[], date: ISODate): P | undefined {
  return plans
    .filter((p) => p.deleted_at === null && p.active_from <= date)
    .sort((a, b) => b.active_from.localeCompare(a.active_from))[0];
}

export async function activePlanFor(date: ISODate): Promise<Local<WeekPlan> | undefined> {
  return pickActivePlan(await db.week_plans.where('_deleted').equals(0).toArray(), date);
}

/** Live days of a plan, Monday first. */
export async function planDays(planId: UUID): Promise<Local<WeekPlanDay>[]> {
  const days = await db.week_plan_days.where('week_plan_id').equals(planId).toArray();
  return days.filter((d) => d._deleted === 0).sort((a, b) => a.weekday - b.weekday);
}

/** Assigns a workout to a weekday, or null for a rest day. A user edit. */
export async function setDayTemplate(dayId: UUID, templateId: UUID | null): Promise<void> {
  await updateRow<WeekPlanDay>('week_plan_days', dayId, { template_id: templateId });
}
