import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Local, SessionExercise } from '../types/domain';
import { db } from './schema';

/** The version 1 schema exactly as it shipped, to build a real legacy database. */
const V1 = {
  exercises: 'id, _dirty, _deleted, updated_at, modality, muscle_group, sort_order',
  workout_templates: 'id, _dirty, _deleted, updated_at, name',
  workout_template_items: 'id, _dirty, _deleted, updated_at, template_id, position',
  week_plans: 'id, _dirty, _deleted, updated_at, active_from',
  week_plan_days: 'id, _dirty, _deleted, updated_at, week_plan_id, weekday',
  sessions: 'id, _dirty, _deleted, updated_at, date, status',
  session_exercises: 'id, _dirty, _deleted, updated_at, session_id, position',
  set_entries: 'id, _dirty, _deleted, updated_at, session_exercise_id, set_index',
  runs: 'id, _dirty, _deleted, updated_at, session_id',
  run_splits: 'id, _dirty, _deleted, updated_at, run_id, split_index',
  body_metrics: 'id, _dirty, _deleted, updated_at, date',
  user_prefs: 'id, _dirty, _deleted, updated_at',
  sync_meta: 'table',
};

const row: Local<SessionExercise> = {
  id: 'se1',
  user_id: null,
  created_at: '2026-10-01T06:00:00.000Z',
  updated_at: '2026-10-01T06:00:00.000Z',
  server_updated_at: null,
  deleted_at: null,
  session_id: 's1',
  exercise_id: 'ex1',
  position: 0,
  notes: null,
  target_sets: 3,
  target_reps: 5,
  target_weight_kg: 100,
  _dirty: 0,
  _deleted: 0,
};

beforeEach(async () => {
  db.close();
  await Dexie.delete('fit_tracker');
});

describe('schema version 2', () => {
  it('finds session exercises by exercise', async () => {
    await db.open();
    await db.session_exercises.put(row);
    expect(await db.session_exercises.where('exercise_id').equals('ex1').count()).toBe(1);
  });

  it('upgrades a version 1 database in place and keeps its rows', async () => {
    const legacy = new Dexie('fit_tracker');
    legacy.version(1).stores(V1);
    await legacy.open();
    await legacy.table('session_exercises').put(row);
    legacy.close();

    await db.open();
    expect(db.verno).toBe(2);
    expect(await db.session_exercises.where('exercise_id').equals('ex1').count()).toBe(1);
  });
});
