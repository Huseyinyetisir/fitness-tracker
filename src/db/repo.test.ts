import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './schema';
import { insertRow, updateRow, softDeleteRow, dirtyRows } from './repo';
import type { Exercise } from '../types/domain';

async function reset() {
  await db.delete();
  await db.open();
}

describe('repo', () => {
  beforeEach(reset);

  it('stamps id, timestamps and the dirty flag on insert', async () => {
    const row = await insertRow<Exercise>('exercises', {
      name: 'Back Squat',
      muscle_group: 'legs',
      modality: 'strength',
      run_type: null,
      default_sets: 3,
      default_reps: 5,
      default_weight_kg: 100,
      default_duration_s: null,
      default_distance_km: null,
      sort_order: 1,
    });

    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.created_at).toBe(row.updated_at);
    expect(row.server_updated_at).toBeNull();
    expect(row.deleted_at).toBeNull();
    expect(row._dirty).toBe(1);

    const stored = await db.exercises.get(row.id);
    expect(stored?.name).toBe('Back Squat');
  });

  it('advances updated_at and re-marks dirty on update', async () => {
    const row = await insertRow<Exercise>('exercises', baseExercise());
    await db.exercises.update(row.id, { _dirty: 0 });

    const updated = await updateRow<Exercise>('exercises', row.id, { name: 'Front Squat' });

    expect(updated.name).toBe('Front Squat');
    expect(updated._dirty).toBe(1);
    expect(updated.updated_at >= row.updated_at).toBe(true);
    expect(updated.created_at).toBe(row.created_at);
  });

  it('sets deleted_at instead of removing the row', async () => {
    const row = await insertRow<Exercise>('exercises', baseExercise());
    await softDeleteRow('exercises', row.id);

    const stored = await db.exercises.get(row.id);
    expect(stored).toBeDefined();
    expect(stored?.deleted_at).not.toBeNull();
    expect(stored?._dirty).toBe(1);
  });

  it('returns only dirty rows', async () => {
    const a = await insertRow<Exercise>('exercises', baseExercise());
    const b = await insertRow<Exercise>('exercises', baseExercise());
    await db.exercises.update(a.id, { _dirty: 0 });

    const dirty = await dirtyRows('exercises');
    expect(dirty.map((r) => r.id)).toEqual([b.id]);
  });

  it('returns an empty array when nothing is dirty', async () => {
    const row = await insertRow<Exercise>('exercises', baseExercise());
    await db.exercises.update(row.id, { _dirty: 0 });
    expect(await dirtyRows('exercises')).toEqual([]);
  });
});

function baseExercise() {
  return {
    name: 'Bench Press',
    muscle_group: 'chest',
    modality: 'strength' as const,
    run_type: null,
    default_sets: 3,
    default_reps: 5,
    default_weight_kg: 80,
    default_duration_s: null,
    default_distance_km: null,
    sort_order: 2,
  };
}
