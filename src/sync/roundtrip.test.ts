import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/schema';
import { insertRow, softDeleteRow, updateRow } from '../db/repo';
import { syncAll } from './engine';
import type { BaseRow, Exercise } from '../types/domain';
import type { PushClient } from './push';
import type { PullClient } from './pull';

/** An in-memory stand-in for Postgres, including the server_updated_at trigger. */
function memoryServer() {
  const store = new Map<string, Map<string, BaseRow>>();
  let clock = 0;

  const client: PushClient & PullClient = {
    async upsert(table, rows) {
      const t = store.get(table) ?? new Map<string, BaseRow>();
      for (const r of rows) {
        clock++;
        t.set(r.id, {
          ...r,
          server_updated_at: new Date(Date.UTC(2026, 0, 1, 0, 0, clock)).toISOString(),
        });
      }
      store.set(table, t);
      return { error: null };
    },

    async select(table, since) {
      const rows = [...(store.get(table)?.values() ?? [])];
      const filtered = since
        ? rows.filter((r) => (r.server_updated_at ?? '') >= since)
        : rows;
      return { rows: filtered, error: null };
    },
  };

  return { client, store };
}

function baseExercise() {
  return {
    name: 'Back Squat',
    muscle_group: 'legs',
    modality: 'strength' as const,
    run_type: null,
    default_sets: 3,
    default_reps: 5,
    default_weight_kg: 100,
    default_duration_s: null,
    default_distance_km: null,
    sort_order: 1,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('sync round trip', () => {
  it('pushes a local row and leaves it clean', async () => {
    const { client, store } = memoryServer();
    const row = await insertRow<Exercise>('exercises', baseExercise());

    await syncAll(client, 'u1');

    // The in-memory store is keyed generically by BaseRow; `name` is an
    // Exercise-specific field, so the read needs a narrowing cast.
    expect((store.get('exercises')?.get(row.id) as Exercise | undefined)?.name).toBe(
      'Back Squat',
    );
    expect((await db.exercises.get(row.id))?._dirty).toBe(0);
  });

  it('is a no-op on a second sync with no changes', async () => {
    const { client } = memoryServer();
    await insertRow<Exercise>('exercises', baseExercise());

    await syncAll(client, 'u1');
    const second = await syncAll(client, 'u1');

    expect(second.pushed).toBe(0);
  });

  it('converges after an edit on both sides', async () => {
    const { client, store } = memoryServer();
    const row = await insertRow<Exercise>('exercises', baseExercise());
    await syncAll(client, 'u1');

    // Remote edit, older than the local edit that follows.
    const remoteRow = store.get('exercises')!.get(row.id)!;
    store.get('exercises')!.set(row.id, {
      ...remoteRow,
      name: 'Remote Name',
      updated_at: '2026-09-10T00:00:00.000Z',
      server_updated_at: '2099-01-01T00:00:00.000Z',
    } as BaseRow);

    await updateRow<Exercise>('exercises', row.id, { name: 'Local Name' });
    await syncAll(client, 'u1');

    // Local edit is newer, so it wins both locally and on the server.
    expect((await db.exercises.get(row.id))?.name).toBe('Local Name');
    expect((store.get('exercises')?.get(row.id) as Exercise | undefined)?.name).toBe(
      'Local Name',
    );
    expect((await db.exercises.get(row.id))?._dirty).toBe(0);
  });

  it('propagates a soft delete to the server', async () => {
    const { client, store } = memoryServer();
    const row = await insertRow<Exercise>('exercises', baseExercise());
    await syncAll(client, 'u1');

    await softDeleteRow('exercises', row.id);
    await syncAll(client, 'u1');

    expect(store.get('exercises')?.get(row.id)?.deleted_at).not.toBeNull();
  });

  it('survives a full local wipe by restoring from the server', async () => {
    const { client } = memoryServer();
    const row = await insertRow<Exercise>('exercises', baseExercise());
    await syncAll(client, 'u1');

    await db.delete();
    await db.open();
    expect(await db.exercises.count()).toBe(0);

    await syncAll(client, 'u1');

    expect((await db.exercises.get(row.id))?.name).toBe('Back Squat');
  });
});
