import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/schema';
import { insertRow, softDeleteRow, updateRow } from '../db/repo';
import { pushTable, stripLocal, type PushClient } from './push';
import type { BaseRow, Exercise } from '../types/domain';

function fakeClient(): PushClient & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async upsert(table, rows) {
      calls.push([table, rows]);
      return { error: null };
    },
  };
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

function bareRow(): BaseRow {
  return {
    id: 'a',
    user_id: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    server_updated_at: null,
    deleted_at: null,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('stripLocal', () => {
  it('removes the _dirty field', () => {
    const out = stripLocal<BaseRow>({ ...bareRow(), _dirty: 1 });
    expect('_dirty' in out).toBe(false);
    expect(out.id).toBe('a');
  });

  it('keeps every synced column', () => {
    const out = stripLocal<BaseRow>({ ...bareRow(), _dirty: 1 });
    expect(out).toEqual(bareRow());
  });

  it('stamps user_id onto the row', () => {
    const out = stripLocal<BaseRow>({ ...bareRow(), _dirty: 1 }, 'u1');
    expect(out.user_id).toBe('u1');
  });
});

describe('pushTable', () => {
  it('uploads dirty rows and clears their flags', async () => {
    const row = await insertRow<Exercise>('exercises', baseExercise());
    const client = fakeClient();

    const n = await pushTable(client, 'exercises', 'u1');

    expect(n).toBe(1);
    expect(client.calls[0][0]).toBe('exercises');
    expect((await db.exercises.get(row.id))?._dirty).toBe(0);
  });

  it('never sends the _dirty field to the server', async () => {
    await insertRow<Exercise>('exercises', baseExercise());
    const client = fakeClient();

    await pushTable(client, 'exercises', 'u1');

    const rows = client.calls[0][1] as Record<string, unknown>[];
    expect(rows.every((r) => !('_dirty' in r))).toBe(true);
  });

  it('pushes tombstones like any other row', async () => {
    const row = await insertRow<Exercise>('exercises', baseExercise());
    await db.exercises.update(row.id, { _dirty: 0 });
    await softDeleteRow('exercises', row.id);

    const client = fakeClient();
    await pushTable(client, 'exercises', 'u1');

    const rows = client.calls[0][1] as Record<string, unknown>[];
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it('does nothing and makes no request when nothing is dirty', async () => {
    const client = fakeClient();
    const n = await pushTable(client, 'exercises', 'u1');
    expect(n).toBe(0);
    expect(client.calls).toEqual([]);
  });

  it('leaves rows dirty when the upload fails', async () => {
    const row = await insertRow<Exercise>('exercises', baseExercise());
    const client: PushClient = {
      async upsert() {
        return { error: new Error('network down') };
      },
    };

    await expect(pushTable(client, 'exercises', 'u1')).rejects.toThrow('network down');
    expect((await db.exercises.get(row.id))?._dirty).toBe(1);
  });

  it('batches large pushes', async () => {
    for (let i = 0; i < 250; i++) {
      await insertRow<Exercise>('exercises', { ...baseExercise(), sort_order: i });
    }
    const client = fakeClient();

    const n = await pushTable(client, 'exercises', 'u1');

    expect(n).toBe(250);
    expect(client.calls.length).toBe(3); // 100 + 100 + 50
  });

  it('does not clear a row that was edited while the push was in flight', async () => {
    const row = await insertRow<Exercise>('exercises', baseExercise());

    // Upsert resolves only after an interleaved local edit has landed,
    // reproducing a set logged while sync is waiting on the network.
    const client: PushClient = {
      async upsert() {
        await updateRow<Exercise>('exercises', row.id, { name: 'Logged mid-sync' });
        return { error: null };
      },
    };

    await pushTable(client, 'exercises', 'u1');

    const stored = await db.exercises.get(row.id);
    expect(stored?.name).toBe('Logged mid-sync');
    expect(stored?._dirty).toBe(1);
  });
});
