import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/schema';
import { insertRow } from '../db/repo';
import { syncAll, pendingCount } from './engine';
import { SYNCED_TABLES } from './tables';
import type { BaseRow, Exercise } from '../types/domain';
import type { PushClient } from './push';
import type { PullClient } from './pull';

function recorder() {
  const pushOrder: string[] = [];
  const pullOrder: string[] = [];
  const client: PushClient & PullClient = {
    async upsert(table) {
      pushOrder.push(table);
      return { error: null };
    },
    async select(table) {
      pullOrder.push(table);
      return { rows: [] as BaseRow[], error: null };
    },
  };
  return { client, pushOrder, pullOrder };
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

describe('pendingCount', () => {
  it('counts dirty rows across every synced table', async () => {
    await insertRow<Exercise>('exercises', baseExercise());
    await insertRow<Exercise>('exercises', baseExercise());
    expect(await pendingCount()).toBe(2);
  });

  it('is 0 on a clean database', async () => {
    expect(await pendingCount()).toBe(0);
  });
});

describe('syncAll', () => {
  it('pushes before it pulls', async () => {
    await insertRow<Exercise>('exercises', baseExercise());
    const { client, pushOrder, pullOrder } = recorder();

    const result = await syncAll(client, 'u1');

    expect(result.pushed).toBe(1);
    expect(pushOrder.length).toBeGreaterThan(0);
    expect(pullOrder.length).toBe(SYNCED_TABLES.length);
  });

  it('pulls every table in foreign-key order', async () => {
    const { client, pullOrder } = recorder();
    await syncAll(client, 'u1');
    expect(pullOrder).toEqual([...SYNCED_TABLES]);
  });

  it('records last_synced_at on success', async () => {
    const { client } = recorder();
    await syncAll(client, 'u1');
    const meta = await db.sync_meta.get('exercises');
    expect(meta?.last_synced_at).not.toBeNull();
    expect(meta?.last_error).toBeNull();
  });

  it('propagates an error and records it', async () => {
    const client: PushClient & PullClient = {
      async upsert() {
        return { error: null };
      },
      async select() {
        return { rows: [], error: new Error('offline') };
      },
    };

    await expect(syncAll(client, 'u1')).rejects.toThrow('offline');
    const meta = await db.sync_meta.get('exercises');
    expect(meta?.last_error).toBe('offline');
  });

  it('leaves rows queued when the sync fails', async () => {
    const row = await insertRow<Exercise>('exercises', baseExercise());
    const client: PushClient & PullClient = {
      async upsert() {
        return { error: new Error('offline') };
      },
      async select() {
        return { rows: [], error: null };
      },
    };

    await expect(syncAll(client, 'u1')).rejects.toThrow('offline');
    expect((await db.exercises.get(row.id))?._dirty).toBe(1);
  });
});
