import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { insertRow, softDeleteRow, updateRow } from './repo';
import { isSystemTimestamp } from '../lib/time';
import type { WorkoutTemplate } from '../types/domain';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('repo write options', () => {
  it('inserts with a caller-supplied id', async () => {
    const row = await insertRow<WorkoutTemplate>(
      'workout_templates',
      { name: 'Push', notes: null },
      { id: '11111111-1111-5111-8111-111111111111' },
    );
    expect(row.id).toBe('11111111-1111-5111-8111-111111111111');
    expect(await db.workout_templates.get(row.id)).toBeDefined();
  });

  it('stamps a system insert in the system range but keeps created_at real', async () => {
    const row = await insertRow<WorkoutTemplate>(
      'workout_templates',
      { name: 'Push', notes: null },
      { system: true },
    );
    expect(isSystemTimestamp(row.updated_at)).toBe(true);
    expect(isSystemTimestamp(row.created_at)).toBe(false);
    expect(row._dirty).toBe(1);
  });

  it('keeps a system update in the system range', async () => {
    const row = await insertRow<WorkoutTemplate>('workout_templates', { name: 'Push', notes: null });
    const updated = await updateRow<WorkoutTemplate>(
      'workout_templates',
      row.id,
      { name: 'Pull' },
      { system: true },
    );
    expect(isSystemTimestamp(updated.updated_at)).toBe(true);
  });

  it('brings a soft-deleted row back with undelete', async () => {
    const row = await insertRow<WorkoutTemplate>('workout_templates', { name: 'Push', notes: null });
    await softDeleteRow('workout_templates', row.id);
    const revived = await updateRow<WorkoutTemplate>('workout_templates', row.id, {}, { undelete: true });
    expect(revived.deleted_at).toBeNull();
    expect(revived._deleted).toBe(0);
  });

  it('stamps a system soft delete in the system range', async () => {
    const row = await insertRow<WorkoutTemplate>('workout_templates', { name: 'Push', notes: null });
    await softDeleteRow('workout_templates', row.id, { system: true });
    const stored = await db.workout_templates.get(row.id);
    expect(stored?._deleted).toBe(1);
    expect(stored?.deleted_at).not.toBeNull();
    expect(isSystemTimestamp(stored!.updated_at)).toBe(true);
  });

  it('lets a later user edit outrank a system write', async () => {
    const row = await insertRow<WorkoutTemplate>(
      'workout_templates',
      { name: 'Push', notes: null },
      { system: true },
    );
    const edited = await updateRow<WorkoutTemplate>('workout_templates', row.id, { name: 'Mine' });
    expect(Date.parse(edited.updated_at)).toBeGreaterThan(Date.parse(row.updated_at));
    expect(isSystemTimestamp(edited.updated_at)).toBe(false);
  });
});
