import { db } from '../../db/schema';
import { insertRow, softDeleteRow, updateRow } from '../../db/repo';
import { DEMO_NOTE } from '../../lib/demoNote';
import type { Exercise, Local, UUID, WorkoutTemplate, WorkoutTemplateItem } from '../../types/domain';
import { moveItem, renumber } from './reorder';

export type WorkoutItemTargets = Partial<
  Pick<
    WorkoutTemplateItem,
    | 'target_sets'
    | 'target_reps'
    | 'target_weight_kg'
    | 'target_duration_s'
    | 'target_distance_km'
    | 'target_rpe'
    | 'rest_seconds'
    | 'notes'
  >
>;

/** A workout's live items in order. */
export async function listWorkoutItems(templateId: UUID): Promise<Local<WorkoutTemplateItem>[]> {
  const rows = await db.workout_template_items.where('template_id').equals(templateId).toArray();
  return rows.filter((r) => r._deleted === 0).sort((a, b) => a.position - b.position);
}

export async function createWorkout(name: string): Promise<Local<WorkoutTemplate>> {
  return insertRow<WorkoutTemplate>('workout_templates', { name: name.trim() || 'New workout', notes: null });
}

export async function renameWorkout(id: UUID, name: string): Promise<void> {
  await updateRow<WorkoutTemplate>('workout_templates', id, { name: name.trim() || 'Untitled workout' });
}

export async function deleteWorkout(id: UUID): Promise<void> {
  await db.transaction('rw', [db.workout_templates, db.workout_template_items], async () => {
    for (const item of await listWorkoutItems(id)) await softDeleteRow('workout_template_items', item.id);
    await softDeleteRow('workout_templates', id);
  });
}

export async function duplicateWorkout(id: UUID): Promise<Local<WorkoutTemplate>> {
  return db.transaction('rw', [db.workout_templates, db.workout_template_items], async () => {
    const source = await db.workout_templates.get(id);
    if (!source) throw new Error(`workout_templates: no row with id ${id}`);
    const copy = await insertRow<WorkoutTemplate>('workout_templates', {
      name: `${source.name} (copy)`,
      // A copy is the user's own workout; the demo marker would let "Remove demo data" take it.
      notes: source.notes === DEMO_NOTE ? null : source.notes,
    });
    for (const item of await listWorkoutItems(id)) {
      await insertRow<WorkoutTemplateItem>('workout_template_items', {
        template_id: copy.id,
        exercise_id: item.exercise_id,
        position: item.position,
        target_sets: item.target_sets,
        target_reps: item.target_reps,
        target_weight_kg: item.target_weight_kg,
        target_duration_s: item.target_duration_s,
        target_distance_km: item.target_distance_km,
        target_rpe: item.target_rpe,
        rest_seconds: item.rest_seconds,
        notes: item.notes,
      });
    }
    return copy;
  });
}

/** Appends an exercise, taking its defaults as the targets. */
export async function addWorkoutItem(templateId: UUID, exercise: Exercise): Promise<Local<WorkoutTemplateItem>> {
  return db.transaction('rw', db.workout_template_items, async () => {
    const items = await listWorkoutItems(templateId);
    const position = items.length > 0 ? items[items.length - 1].position + 1 : 0;
    return insertRow<WorkoutTemplateItem>('workout_template_items', {
      template_id: templateId,
      exercise_id: exercise.id,
      position,
      target_sets: exercise.default_sets,
      target_reps: exercise.default_reps,
      target_weight_kg: exercise.default_weight_kg,
      target_duration_s: exercise.default_duration_s,
      target_distance_km: exercise.default_distance_km,
      target_rpe: null,
      rest_seconds: null,
      notes: null,
    });
  });
}

export async function updateWorkoutItem(id: UUID, patch: WorkoutItemTargets): Promise<void> {
  await updateRow<WorkoutTemplateItem>('workout_template_items', id, patch);
}

export async function removeWorkoutItem(templateId: UUID, id: UUID): Promise<void> {
  await db.transaction('rw', db.workout_template_items, async () => {
    await softDeleteRow('workout_template_items', id);
    for (const change of renumber(await listWorkoutItems(templateId))) {
      await updateRow<WorkoutTemplateItem>('workout_template_items', change.id, { position: change.position });
    }
  });
}

export async function moveWorkoutItem(templateId: UUID, id: UUID, delta: -1 | 1): Promise<void> {
  await db.transaction('rw', db.workout_template_items, async () => {
    for (const change of moveItem(await listWorkoutItems(templateId), id, delta)) {
      await updateRow<WorkoutTemplateItem>('workout_template_items', change.id, { position: change.position });
    }
  });
}
