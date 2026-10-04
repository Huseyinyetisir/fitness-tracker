import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { resetDb } from '../../test/fixtures';
import { EMPTY_EXERCISE } from './exerciseRules';
import { createExercise, deleteExercise, duplicateExercise, updateExercise } from './exercisesRepo';

beforeEach(resetDb);

describe('exercisesRepo', () => {
  it('appends new exercises after the existing sort order', async () => {
    const a = await createExercise({ ...EMPTY_EXERCISE, name: 'A' });
    const b = await createExercise({ ...EMPTY_EXERCISE, name: 'B' });
    expect(b.sort_order).toBe(a.sort_order + 1);
  });

  it('normalises what it stores', async () => {
    const row = await createExercise({ ...EMPTY_EXERCISE, name: '  Squat  ', run_type: 'easy' });
    expect(row.name).toBe('Squat');
    expect(row.run_type).toBeNull();
  });

  it('updates an exercise', async () => {
    const row = await createExercise({ ...EMPTY_EXERCISE, name: 'Squat' });
    await updateExercise(row.id, { ...EMPTY_EXERCISE, name: 'Front Squat' });
    expect((await db.exercises.get(row.id))?.name).toBe('Front Squat');
  });

  it('duplicates an exercise under a new id', async () => {
    const row = await createExercise({ ...EMPTY_EXERCISE, name: 'Squat', default_weight_kg: 100 });
    const copy = await duplicateExercise(row.id);
    expect(copy.id).not.toBe(row.id);
    expect(copy.name).toBe('Squat (copy)');
    expect(copy.default_weight_kg).toBe(100);
  });

  it('soft-deletes, so history that references the exercise survives', async () => {
    const row = await createExercise({ ...EMPTY_EXERCISE, name: 'Squat' });
    await deleteExercise(row.id);
    const stored = await db.exercises.get(row.id);
    expect(stored?._deleted).toBe(1);
    expect(stored?.name).toBe('Squat');
  });
});
