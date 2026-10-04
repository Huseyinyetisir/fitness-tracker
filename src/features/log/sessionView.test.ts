import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { makeExercise, makeWorkout, resetDb } from '../../test/fixtures';
import { removeSession, createSessionFromTemplate } from './sessionsRepo';
import { loadLastTime, loadSessionView } from './sessionView';
import { finishSession, logSet } from './setsRepo';

const SET = { reps: 5, weight_kg: 100, rpe: 8, is_warmup: false };

beforeEach(resetDb);

describe('loadSessionView', () => {
  it('loads a session with its exercises and live sets in order', async () => {
    const squat = await makeExercise('Squat');
    const bench = await makeExercise('Bench');
    const w = await makeWorkout('Full', [squat, bench]);
    const session = await createSessionFromTemplate('2026-10-05', w.id, { wasPlanned: true });
    const children = (await db.session_exercises.where('session_id').equals(session.id).toArray()).sort(
      (a, b) => a.position - b.position,
    );
    await logSet(children[0].id, SET);
    await logSet(children[0].id, { ...SET, reps: 4 });

    const view = await loadSessionView(session.id);
    expect(view?.title).toBe('Full');
    expect(view?.blocks.map((b) => b.exercise?.name)).toEqual(['Squat', 'Bench']);
    expect(view?.blocks[0].sets.map((s) => s.reps)).toEqual([5, 4]);
    expect(view?.templateItems).toHaveLength(2);
  });

  it('is null for a removed session', async () => {
    const session = await createSessionFromTemplate('2026-10-05', null, { wasPlanned: false });
    await removeSession(session.id);
    expect(await loadSessionView(session.id)).toBeNull();
  });
});

describe('loadLastTime', () => {
  it("finds the previous session's working sets for an exercise", async () => {
    const squat = await makeExercise('Squat');
    const w = await makeWorkout('Legs', [squat]);
    const before = await createSessionFromTemplate('2026-10-01', w.id, { wasPlanned: true });
    const [beforeChild] = await db.session_exercises.where('session_id').equals(before.id).toArray();
    await logSet(beforeChild.id, { ...SET, weight_kg: 97.5 });
    await finishSession(before.id, { status: 'done', energy: null, notes: null });
    const now = await createSessionFromTemplate('2026-10-05', w.id, { wasPlanned: true });

    const sets = await loadLastTime(squat.id, now.id, '2026-10-05');
    expect(sets.map((s) => s.weight_kg)).toEqual([97.5]);
  });
});
