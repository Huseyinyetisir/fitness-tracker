import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { makeExercise, resetDb } from '../../test/fixtures';
import {
  addWorkoutItem,
  createWorkout,
  deleteWorkout,
  duplicateWorkout,
  listWorkoutItems,
  moveWorkoutItem,
  removeWorkoutItem,
  renameWorkout,
} from './workoutsRepo';

beforeEach(resetDb);

async function pushDay() {
  const workout = await createWorkout('Push');
  const bench = await makeExercise('Bench');
  const ohp = await makeExercise('Overhead Press');
  const dips = await makeExercise('Dips');
  for (const e of [bench, ohp, dips]) await addWorkoutItem(workout.id, e);
  return { workout, bench, ohp, dips };
}

describe('workoutsRepo', () => {
  it('names an unnamed workout', async () => {
    expect((await createWorkout('  ')).name).toBe('New workout');
  });

  it('renames a workout', async () => {
    const w = await createWorkout('Push');
    await renameWorkout(w.id, 'Push A');
    expect((await db.workout_templates.get(w.id))?.name).toBe('Push A');
  });

  it('adds items at the end with the exercise defaults as targets', async () => {
    const { workout, bench } = await pushDay();
    const items = await listWorkoutItems(workout.id);
    expect(items.map((i) => i.position)).toEqual([0, 1, 2]);
    expect(items[0].exercise_id).toBe(bench.id);
    expect(items[0].target_sets).toBe(3);
    expect(items[0].target_reps).toBe(5);
    expect(items[0].target_weight_kg).toBe(100);
  });

  it('moves an item', async () => {
    const { workout, ohp } = await pushDay();
    const before = await listWorkoutItems(workout.id);
    await moveWorkoutItem(workout.id, before[1].id, -1);
    expect((await listWorkoutItems(workout.id))[0].exercise_id).toBe(ohp.id);
  });

  it('removes an item and closes the gap', async () => {
    const { workout, dips } = await pushDay();
    const before = await listWorkoutItems(workout.id);
    await removeWorkoutItem(workout.id, before[1].id);
    const after = await listWorkoutItems(workout.id);
    expect(after.map((i) => i.position)).toEqual([0, 1]);
    expect(after[1].exercise_id).toBe(dips.id);
  });

  it('duplicates a workout with its items, leaving the original alone', async () => {
    const { workout, bench } = await pushDay();
    const copy = await duplicateWorkout(workout.id);
    expect(copy.name).toBe('Push (copy)');
    const copied = await listWorkoutItems(copy.id);
    expect(copied).toHaveLength(3);
    expect(copied[0].exercise_id).toBe(bench.id);
    expect(await listWorkoutItems(workout.id)).toHaveLength(3);
  });

  it('soft-deletes a workout together with its items', async () => {
    const { workout } = await pushDay();
    await deleteWorkout(workout.id);
    expect((await db.workout_templates.get(workout.id))?._deleted).toBe(1);
    expect(await listWorkoutItems(workout.id)).toEqual([]);
    expect(await db.workout_template_items.count()).toBe(3);
  });
});
