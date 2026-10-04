import { db } from '../db/schema';
import { createExercise } from '../features/library/exercisesRepo';
import { addWorkoutItem, createWorkout } from '../features/plan/workoutsRepo';
import type { BaseRow, Exercise, Local, LocalMeta, Modality, WorkoutTemplate } from '../types/domain';

export const USER = 'user-1';

export async function resetDb(): Promise<void> {
  await db.delete();
  await db.open();
}

/** Records a completed sync, which first-time setup waits for. */
export async function markSynced(): Promise<void> {
  await db.sync_meta.put({
    table: 'exercises',
    watermark: null,
    last_synced_at: '2026-10-01T06:00:00.000Z',
    last_error: null,
  });
}

export async function makeExercise(name: string, modality: Modality = 'strength'): Promise<Local<Exercise>> {
  const cardio = modality === 'cardio';
  return createExercise({
    name,
    muscle_group: cardio ? 'cardio' : 'legs',
    modality,
    run_type: cardio ? 'easy' : null,
    default_sets: cardio ? null : 3,
    default_reps: cardio ? null : 5,
    default_weight_kg: cardio ? null : 100,
    default_duration_s: cardio ? 1800 : null,
    default_distance_km: cardio ? 5 : null,
  });
}

export async function makeWorkout(name: string, exercises: Exercise[]): Promise<Local<WorkoutTemplate>> {
  const workout = await createWorkout(name);
  for (const e of exercises) await addWorkoutItem(workout.id, e);
  return workout;
}

/** The columns every row carries, for building rows in pure tests. */
export function base(id: string, extra: Partial<BaseRow> = {}): BaseRow & LocalMeta {
  return {
    id,
    user_id: null,
    created_at: '2026-10-01T06:00:00.000Z',
    updated_at: '2026-10-01T06:00:00.000Z',
    server_updated_at: null,
    deleted_at: null,
    _dirty: 0,
    _deleted: extra.deleted_at ? 1 : 0,
    ...extra,
  };
}
