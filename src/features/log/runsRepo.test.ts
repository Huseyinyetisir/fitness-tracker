import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { isSystemTimestamp } from '../../lib/time';
import { USER, makeExercise, makeWorkout, markSynced, resetDb } from '../../test/fixtures';
import { materializeWeek, plannedSessionId } from '../plan/materialize';
import { defaultPlanDayId, ensureWeekPlan, setDayTemplate } from '../plan/planRepo';
import { emptyRunDraft, type RunDraft } from './runRules';
import { removeRun, saveRun } from './runsRepo';
import { createSessionFromTemplate } from './sessionsRepo';
import { logSet } from './setsRepo';

const MON = '2026-10-05';
const DRAFT: RunDraft = { ...emptyRunDraft(8), duration: '42:30', rpe: 6, splits: [{ distance: 1, duration: '5:10' }] };

beforeEach(resetDb);

/** Monday materialized from the plan as a mixed workout (Squat, then an easy run), untouched. */
async function materializedBrick() {
  await markSynced();
  const squat = await makeExercise('Squat');
  const easy = await makeExercise('Easy Run', 'cardio');
  const brick = await makeWorkout('Brick', [squat, easy]);
  await ensureWeekPlan(USER, MON);
  await setDayTemplate(defaultPlanDayId(USER, 1), brick.id);
  await materializeWeek(USER, MON, MON);
  const sessionId = plannedSessionId(USER, MON);
  const children = (await db.session_exercises.where('session_id').equals(sessionId).toArray())
    .filter((c) => c._deleted === 0)
    .sort((a, b) => a.position - b.position);
  expect((await db.sessions.get(sessionId))?.kind).toBe('mixed');
  expect(isSystemTimestamp((await db.sessions.get(sessionId))!.updated_at)).toBe(true);
  return { sessionId, children, squat, easy };
}

async function liveRuns() {
  return (await db.runs.toArray()).filter((r) => r._deleted === 0);
}

describe('saveRun', () => {
  it('creates a finished, unplanned session for a run logged from scratch', async () => {
    const easy = await makeExercise('Easy Run', 'cardio');
    const sessionId = await saveRun({ sessionId: null, date: MON, exerciseId: easy.id, draft: DRAFT });

    expect(await db.sessions.get(sessionId)).toMatchObject({ kind: 'run', status: 'done', was_planned: false, date: MON });
    const [run] = await liveRuns();
    expect(run).toMatchObject({ session_id: sessionId, distance_km: 8, duration_s: 2550, rpe: 6, run_type: 'easy' });
    const splits = await db.run_splits.where('run_id').equals(run.id).toArray();
    expect(splits.map((s) => s.duration_s)).toEqual([310]);
  });

  it('updates the run in place on a second save, replacing its splits', async () => {
    const easy = await makeExercise('Easy Run', 'cardio');
    const sessionId = await saveRun({ sessionId: null, date: MON, exerciseId: easy.id, draft: DRAFT });
    await saveRun({
      sessionId,
      date: MON,
      exerciseId: easy.id,
      draft: { ...DRAFT, distance: 8.2, splits: [{ distance: 1, duration: '5:00' }, { distance: 1, duration: '4:55' }] },
    });

    const runs = await liveRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].distance_km).toBe(8.2);
    // Rows sharing an index key come back in primary-key order — random UUIDs —
    // so sort before asserting order.
    const live = (await db.run_splits.where('run_id').equals(runs[0].id).toArray())
      .filter((s) => s._deleted === 0)
      .sort((a, b) => a.split_index - b.split_index);
    expect(live.map((s) => [s.split_index, s.duration_s])).toEqual([
      [0, 300],
      [1, 295],
    ]);
  });

  it('logs into a planned run session', async () => {
    const easy = await makeExercise('Easy Run', 'cardio');
    const planned = await createSessionFromTemplate(MON, (await makeWorkout('Easy', [easy])).id, { wasPlanned: true });
    const sessionId = await saveRun({ sessionId: planned.id, date: MON, exerciseId: easy.id, draft: DRAFT });
    expect(sessionId).toBe(planned.id);
    expect(await liveRuns()).toHaveLength(1);
  });

  it('refuses a run without an RPE and writes nothing', async () => {
    const easy = await makeExercise('Easy Run', 'cardio');
    await expect(
      saveRun({ sessionId: null, date: MON, exerciseId: easy.id, draft: { ...DRAFT, rpe: null } }),
    ).rejects.toThrow(/RPE/);
    expect(await db.sessions.count()).toBe(0);
  });
});

describe('saveRun into a materialized session', () => {
  it('claims the session and its exercises', async () => {
    const { sessionId, easy } = await materializedBrick();
    await saveRun({ sessionId, date: MON, exerciseId: easy.id, draft: DRAFT });

    const session = await db.sessions.get(sessionId);
    expect(isSystemTimestamp(session!.updated_at)).toBe(false);
    expect(session?.started_at).not.toBeNull();
    const children = (await db.session_exercises.where('session_id').equals(sessionId).toArray()).filter(
      (c) => c._deleted === 0,
    );
    expect(children).toHaveLength(2);
    expect(children.map((c) => isSystemTimestamp(c.updated_at))).toEqual([false, false]);
  });
});

describe('removeRun', () => {
  it('removes only the run and its splits, leaving the session and its strength sets', async () => {
    const { sessionId, children, easy } = await materializedBrick();
    const squatChild = children[0];
    const set = await logSet(squatChild.id, { reps: 5, weight_kg: 100, rpe: 8, is_warmup: false });
    await saveRun({ sessionId, date: MON, exerciseId: easy.id, draft: DRAFT });
    const [run] = await liveRuns();
    const splitIds = (await db.run_splits.where('run_id').equals(run.id).toArray()).map((s) => s.id);
    expect(splitIds).toHaveLength(1);

    await removeRun(sessionId);

    expect((await db.runs.get(run.id))?._deleted).toBe(1);
    for (const id of splitIds) expect((await db.run_splits.get(id))?._deleted).toBe(1);
    const session = await db.sessions.get(sessionId);
    expect(session?._deleted).toBe(0);
    expect(isSystemTimestamp(session!.updated_at)).toBe(false);
    expect((await db.session_exercises.get(squatChild.id))?._deleted).toBe(0);
    expect((await db.set_entries.get(set.id))?._deleted).toBe(0);
  });

  it('does nothing when the session has no run', async () => {
    const { sessionId } = await materializedBrick();
    const before = await db.sessions.get(sessionId);
    await removeRun(sessionId);
    expect(await db.runs.count()).toBe(0);
    expect(await db.sessions.get(sessionId)).toEqual(before);
  });
});
