import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { makeExercise, makeWorkout, resetDb } from '../../test/fixtures';
import { emptyRunDraft, type RunDraft } from './runRules';
import { saveRun } from './runsRepo';
import { createSessionFromTemplate } from './sessionsRepo';

const MON = '2026-10-05';
const DRAFT: RunDraft = { ...emptyRunDraft(8), duration: '42:30', rpe: 6, splits: [{ distance: 1, duration: '5:10' }] };

beforeEach(resetDb);

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
