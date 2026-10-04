import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { insertRow } from '../../db/repo';
import { isSystemTimestamp } from '../../lib/time';
import { USER, markSynced, resetDb } from '../../test/fixtures';
import type { WeekPlan } from '../../types/domain';
import {
  activePlanFor,
  defaultPlanDayId,
  defaultPlanId,
  ensureWeekPlan,
  pickActivePlan,
  planDays,
  setDayTemplate,
} from './planRepo';

const WED = '2026-10-07';

beforeEach(resetDb);

describe('ensureWeekPlan', () => {
  it('does nothing before the first sync has completed', async () => {
    expect(await ensureWeekPlan(USER, WED)).toBeUndefined();
    expect(await db.week_plans.count()).toBe(0);
  });

  it('creates the default plan and seven rest days as system writes', async () => {
    await markSynced();
    const result = await ensureWeekPlan(USER, WED);

    expect(result?.created).toBe(true);
    expect(result?.plan.id).toBe(defaultPlanId(USER));
    expect(result?.plan.active_from).toBe('2026-10-05');
    expect(isSystemTimestamp(result!.plan.updated_at)).toBe(true);

    const days = await planDays(defaultPlanId(USER));
    expect(days.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(days.every((d) => d.template_id === null)).toBe(true);
    expect(days[0].id).toBe(defaultPlanDayId(USER, 1));
    expect(days.every((d) => isSystemTimestamp(d.updated_at))).toBe(true);
  });

  it('is idempotent', async () => {
    await markSynced();
    await ensureWeekPlan(USER, WED);
    const second = await ensureWeekPlan(USER, WED);

    expect(second?.created).toBe(false);
    expect(await db.week_plans.count()).toBe(1);
    expect(await db.week_plan_days.count()).toBe(7);
  });

  it('is safe under concurrent calls', async () => {
    await markSynced();
    await Promise.all([ensureWeekPlan(USER, WED), ensureWeekPlan(USER, WED)]);
    expect(await db.week_plans.count()).toBe(1);
    expect(await db.week_plan_days.count()).toBe(7);
  });
});

describe('plan ids', () => {
  it('are the same for the same user and differ between users', () => {
    expect(defaultPlanId(USER)).toBe(defaultPlanId(USER));
    expect(defaultPlanId(USER)).not.toBe(defaultPlanId('someone-else'));
    expect(defaultPlanDayId(USER, 1)).not.toBe(defaultPlanDayId(USER, 2));
  });
});

describe('setDayTemplate', () => {
  it('is a user edit, so it outranks the system default', async () => {
    await markSynced();
    await ensureWeekPlan(USER, WED);
    await setDayTemplate(defaultPlanDayId(USER, 1), 'template-1');

    const monday = await db.week_plan_days.get(defaultPlanDayId(USER, 1));
    expect(monday?.template_id).toBe('template-1');
    expect(isSystemTimestamp(monday!.updated_at)).toBe(false);
  });
});

describe('active plan', () => {
  function plan(id: string, activeFrom: string, deleted = false): WeekPlan {
    return {
      id,
      user_id: null,
      created_at: '',
      updated_at: '',
      server_updated_at: null,
      deleted_at: deleted ? '2026-01-01T00:00:00.000Z' : null,
      name: id,
      active_from: activeFrom,
    };
  }

  it('picks the latest plan that has started', () => {
    const plans = [plan('a', '2026-01-05'), plan('b', '2026-09-07'), plan('c', '2026-12-07')];
    expect(pickActivePlan(plans, WED)?.id).toBe('b');
  });

  it('ignores deleted plans', () => {
    const plans = [plan('a', '2026-01-05'), plan('b', '2026-09-07', true)];
    expect(pickActivePlan(plans, WED)?.id).toBe('a');
  });

  it('returns nothing before any plan starts', () => {
    expect(pickActivePlan([plan('a', '2027-01-04')], WED)).toBeUndefined();
  });

  it('reads plans from the database', async () => {
    await insertRow<WeekPlan>('week_plans', { name: 'Block', active_from: '2026-09-07' });
    expect((await activePlanFor(WED))?.name).toBe('Block');
  });
});
