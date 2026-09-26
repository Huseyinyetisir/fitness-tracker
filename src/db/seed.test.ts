import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './schema';
import { seedExercises, SEED_EXERCISES } from './seed';

async function markSynced() {
  await db.sync_meta.put({
    table: 'exercises',
    watermark: null,
    last_synced_at: '2026-09-22T06:00:00.000Z',
    last_error: null,
  });
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await markSynced();
});

describe('seedExercises', () => {
  it('seeds at least 40 strength exercises and 4 run types', async () => {
    await seedExercises();
    const all = await db.exercises.toArray();
    expect(all.filter((e) => e.modality === 'strength').length).toBeGreaterThanOrEqual(40);
    expect(all.filter((e) => e.modality === 'cardio').length).toBe(4);
  });

  it('marks every seeded row dirty so it syncs up', async () => {
    await seedExercises();
    const all = await db.exercises.toArray();
    expect(all.every((e) => e._dirty === 1)).toBe(true);
  });

  it('is idempotent — running twice does not duplicate', async () => {
    await seedExercises();
    const first = await db.exercises.count();
    await seedExercises();
    expect(await db.exercises.count()).toBe(first);
  });

  it('is idempotent under concurrent calls', async () => {
    await Promise.all([seedExercises(), seedExercises()]);
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length);
  });

  it('does not seed when the library already has rows', async () => {
    await seedExercises();
    await db.exercises.toCollection().modify({ name: 'renamed' });
    await seedExercises();
    const all = await db.exercises.toArray();
    expect(all.every((e) => e.name === 'renamed')).toBe(true);
  });

  it('gives every cardio row a run_type and every strength row none', () => {
    for (const e of SEED_EXERCISES) {
      if (e.modality === 'cardio') expect(e.run_type).not.toBeNull();
      else expect(e.run_type).toBeNull();
    }
  });

  it('has no duplicate names', () => {
    const names = SEED_EXERCISES.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('does not seed before the first sync has completed', async () => {
    await db.sync_meta.delete('exercises');
    const n = await seedExercises();
    expect(n).toBe(0);
    expect(await db.exercises.count()).toBe(0);
  });
});
