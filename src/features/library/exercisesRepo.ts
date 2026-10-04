import { db } from '../../db/schema';
import { insertRow, softDeleteRow, updateRow } from '../../db/repo';
import type { Exercise, Local, UUID } from '../../types/domain';
import { normalizeExercise, toInput, type ExerciseInput } from './exerciseRules';

async function nextSortOrder(): Promise<number> {
  const last = await db.exercises.orderBy('sort_order').last();
  return (last?.sort_order ?? 0) + 1;
}

export async function createExercise(input: ExerciseInput): Promise<Local<Exercise>> {
  return insertRow<Exercise>('exercises', { ...normalizeExercise(input), sort_order: await nextSortOrder() });
}

export async function updateExercise(id: UUID, input: ExerciseInput): Promise<Local<Exercise>> {
  return updateRow<Exercise>('exercises', id, normalizeExercise(input));
}

/**
 * Soft delete. Workouts and logged sessions that reference the exercise keep
 * working and show its name with "(deleted)".
 */
export async function deleteExercise(id: UUID): Promise<void> {
  await softDeleteRow('exercises', id);
}

export async function duplicateExercise(id: UUID): Promise<Local<Exercise>> {
  const source = await db.exercises.get(id);
  if (!source) throw new Error(`exercises: no row with id ${id}`);
  return createExercise({ ...toInput(source), name: `${source.name} (copy)` });
}
