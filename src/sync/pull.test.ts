import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/schema';
import { insertRow } from '../db/repo';
import { pullTable, getWatermark, setWatermark, type PullClient } from './pull';
import type { BaseRow, Exercise } from '../types/domain';

function remote(id: string, updated: string, server: string, extra: Partial<BaseRow> = {}) {
  return {
    id,
    user_id: 'u1',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: updated,
    server_updated_at: server,
    deleted_at: null,
    name: 'Remote Squat',
    muscle_group: 'legs',
    modality: 'strength',
    run_type: null,
    default_sets: 3,
    default_reps: 5,
    default_weight_kg: 100,
    default_duration_s: null,
    default_distance_km: null,
    sort_order: 1,
    ...extra,
  } as unknown as BaseRow;
}

function fakeClient(rows: BaseRow[]): PullClient & { lastSince: string | null } {
  const c = {
    lastSince: null as string | null,
    async select(_table: string, since: string | null) {
      c.lastSince = since;
      const filtered = since
        ? rows.filter((r) => (r.server_updated_at ?? '') >= since)
        : rows;
      return { rows: filtered, error: null };
    },
  };
  return c;
}

function baseExercise() {
  return {
    name: 'Local Squat',
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

describe('pullTable', () => {
  it('inserts rows that do not exist locally', async () => {
    const client = fakeClient([remote('r1', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:01.000Z')]);

    const n = await pullTable(client, 'exercises');

    expect(n).toBe(1);
    const stored = await db.exercises.get('r1');
    expect(stored?.name).toBe('Remote Squat');
    expect(stored?._dirty).toBe(0);
  });

  it('overwrites a local row when the remote row is newer', async () => {
    const local = await insertRow<Exercise>('exercises', baseExercise());
    const client = fakeClient([remote(local.id, '2099-01-01T00:00:00.000Z', '2099-01-01T00:00:01.000Z')]);

    await pullTable(client, 'exercises');

    expect((await db.exercises.get(local.id))?.name).toBe('Remote Squat');
  });

  it('keeps a local row that is newer and leaves it dirty', async () => {
    const local = await insertRow<Exercise>('exercises', baseExercise());
    const client = fakeClient([remote(local.id, '2000-01-01T00:00:00.000Z', '2026-09-10T00:00:01.000Z')]);

    await pullTable(client, 'exercises');

    const stored = await db.exercises.get(local.id);
    expect(stored?.name).toBe('Local Squat');
    expect(stored?._dirty).toBe(1);
  });

  it('applies a remote tombstone', async () => {
    const client = fakeClient([
      remote('r1', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:01.000Z', {
        deleted_at: '2026-09-10T00:00:00.000Z',
      }),
    ]);

    await pullTable(client, 'exercises');

    expect((await db.exercises.get('r1'))?.deleted_at).toBe('2026-09-10T00:00:00.000Z');
  });

  it('advances the watermark to the highest server_updated_at received', async () => {
    const client = fakeClient([
      remote('r1', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:01.000Z'),
      remote('r2', '2026-09-11T00:00:00.000Z', '2026-09-11T00:00:05.000Z'),
    ]);

    await pullTable(client, 'exercises');

    expect(await getWatermark('exercises')).toBe('2026-09-11T00:00:05.000Z');
  });

  it('queries with >= so rows sharing the watermark are not missed', async () => {
    await setWatermark('exercises', '2026-09-10T00:00:01.000Z');
    const client = fakeClient([
      remote('r1', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:01.000Z'),
      remote('r2', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:01.000Z'),
    ]);

    const n = await pullTable(client, 'exercises');

    expect(client.lastSince).toBe('2026-09-10T00:00:01.000Z');
    expect(n).toBe(2);
  });

  it('leaves the watermark untouched when nothing came back', async () => {
    await setWatermark('exercises', '2026-09-10T00:00:01.000Z');
    const client = fakeClient([]);

    await pullTable(client, 'exercises');

    expect(await getWatermark('exercises')).toBe('2026-09-10T00:00:01.000Z');
  });

  it('does not advance the watermark when the request fails', async () => {
    await setWatermark('exercises', '2026-09-10T00:00:01.000Z');
    const client: PullClient = {
      async select() {
        return { rows: [], error: new Error('offline') };
      },
    };

    await expect(pullTable(client, 'exercises')).rejects.toThrow('offline');
    expect(await getWatermark('exercises')).toBe('2026-09-10T00:00:01.000Z');
  });
});
