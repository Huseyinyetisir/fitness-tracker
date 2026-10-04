import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { insertRow } from '../../db/repo';
import { isSystemTimestamp } from '../../lib/time';
import { makeExercise, makeWorkout, resetDb } from '../../test/fixtures';
import type { Run, RunSplit, SetEntry } from '../../types/domain';
import { createSessionFromTemplate, removeSession } from './sessionsRepo';

const MON = '2026-10-05';

beforeEach(resetDb);

describe('createSessionFromTemplate', () => {
  it('copies the workout into a session the user owns', async () => {
    const squat = await makeExercise('Squat');
    const legs = await makeWorkout('Legs', [squat]);
    const session = await createSessionFromTemplate(MON, legs.id, { wasPlanned: false });

    expect(session).toMatchObject({ date: MON, status: 'planned', template_id: legs.id, was_planned: false, kind: 'strength' });
    expect(isSystemTimestamp(session.updated_at)).toBe(false);
    const children = await db.session_exercises.where('session_id').equals(session.id).toArray();
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({ exercise_id: squat.id, target_sets: 3, target_reps: 5, target_weight_kg: 100 });
  });

  it('creates an empty strength session without a workout', async () => {
    const session = await createSessionFromTemplate(MON, null, { wasPlanned: false });
    expect(session.kind).toBe('strength');
    expect(await db.session_exercises.count()).toBe(0);
  });

  it('gives each call a new id', async () => {
    const a = await createSessionFromTemplate(MON, null, { wasPlanned: true });
    const b = await createSessionFromTemplate(MON, null, { wasPlanned: true });
    expect(a.id).not.toBe(b.id);
  });
});

describe('removeSession', () => {
  it('soft-deletes the session and everything logged under it', async () => {
    const squat = await makeExercise('Squat');
    const legs = await makeWorkout('Legs', [squat]);
    const session = await createSessionFromTemplate(MON, legs.id, { wasPlanned: true });
    const [child] = await db.session_exercises.where('session_id').equals(session.id).toArray();
    await insertRow<SetEntry>('set_entries', {
      session_exercise_id: child.id,
      set_index: 0,
      reps: 5,
      weight_kg: 100,
      rpe: 8,
      is_warmup: false,
      notes: null,
    });
    const run = await insertRow<Run>('runs', {
      session_id: session.id,
      exercise_id: squat.id,
      run_type: 'easy',
      distance_km: 5,
      duration_s: 1500,
      rpe: 6,
      avg_hr: null,
      weather: null,
      route_note: null,
    });
    await insertRow<RunSplit>('run_splits', { run_id: run.id, split_index: 0, distance_km: 1, duration_s: 300 });

    await removeSession(session.id);

    for (const table of [db.sessions, db.session_exercises, db.set_entries, db.runs, db.run_splits]) {
      const rows = await table.toArray();
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r._deleted === 1)).toBe(true);
    }
  });
});
