import { useState } from 'react';
import { navigate } from '../../app/useRoute';
import Button, { IconButton } from '../../components/Button';
import { NumberField, TextField } from '../../components/Fields';
import Loading from '../../components/Loading';
import NotFound from '../../components/NotFound';
import ScreenHeader from '../../components/ScreenHeader';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import type { Exercise, Local, UUID, WorkoutTemplateItem } from '../../types/domain';
import ExercisePicker from '../library/ExercisePicker';
import {
  addWorkoutItem,
  deleteWorkout,
  duplicateWorkout,
  listWorkoutItems,
  moveWorkoutItem,
  removeWorkoutItem,
  renameWorkout,
  updateWorkoutItem,
  type WorkoutItemTargets,
} from './workoutsRepo';

export default function WorkoutEditor({ id }: { id: UUID }) {
  const [picking, setPicking] = useState(false);
  const data = useLiveQuery(async () => {
    const template = await db.workout_templates.get(id);
    if (!template || template._deleted === 1) return null;
    const items = await listWorkoutItems(id);
    const exercises = await db.exercises.toArray();
    return { template, items, exerciseById: new Map(exercises.map((e) => [e.id, e])) };
  }, [id]);

  if (data === undefined) return <Loading />;
  if (data === null) return <NotFound what="workout" back={{ name: 'workouts' }} />;
  const { template, items, exerciseById } = data;

  return (
    <section>
      <ScreenHeader title={template.name} back={{ name: 'workouts' }} />
      <div className="mb-4">
        <TextField
          label="Name"
          defaultValue={template.name}
          onBlur={(e) => {
            if (e.target.value.trim() !== template.name) void renameWorkout(id, e.target.value);
          }}
        />
      </div>

      <ol className="mb-4 space-y-3">
        {items.map((item, index) => (
          <ItemRow
            key={item.id}
            item={item}
            exercise={exerciseById.get(item.exercise_id)}
            first={index === 0}
            last={index === items.length - 1}
          />
        ))}
      </ol>
      {items.length === 0 && <p className="mb-4 text-muted">No exercises yet.</p>}

      {picking ? (
        <ExercisePicker
          onCancel={() => setPicking(false)}
          onPick={async (exercise) => {
            await addWorkoutItem(id, exercise);
            setPicking(false);
          }}
        />
      ) : (
        <Button block onClick={() => setPicking(true)}>
          + Add exercise
        </Button>
      )}

      <div className="mt-8 grid grid-cols-2 gap-2">
        <Button
          onClick={async () => {
            const copy = await duplicateWorkout(id);
            navigate({ name: 'workout', id: copy.id });
          }}
        >
          Duplicate
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (!window.confirm(`Delete ${template.name}? Days already planned keep their exercises.`)) return;
            await deleteWorkout(id);
            navigate({ name: 'workouts' });
          }}
        >
          Delete
        </Button>
      </div>
    </section>
  );
}

function ItemRow({
  item,
  exercise,
  first,
  last,
}: {
  item: Local<WorkoutTemplateItem>;
  exercise: Exercise | undefined;
  first: boolean;
  last: boolean;
}) {
  const cardio = exercise?.modality === 'cardio';
  const name = exercise ? `${exercise.name}${exercise.deleted_at ? ' (deleted)' : ''}` : 'Unknown exercise';

  /** Writes only values a target can hold; a half-typed "abc" is ignored rather than stored. */
  const update = (patch: WorkoutItemTargets) => {
    const ok = Object.values(patch).every((v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0));
    if (ok) void updateWorkoutItem(item.id, patch);
  };

  return (
    <li className="space-y-3 rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 font-medium">{name}</span>
        <IconButton label={`Move ${name} up`} disabled={first} onClick={() => void moveWorkoutItem(item.template_id, item.id, -1)}>
          ↑
        </IconButton>
        <IconButton label={`Move ${name} down`} disabled={last} onClick={() => void moveWorkoutItem(item.template_id, item.id, 1)}>
          ↓
        </IconButton>
        <IconButton
          label={`Remove ${name}`}
          onClick={() => {
            if (window.confirm(`Remove ${name} from this workout?`)) void removeWorkoutItem(item.template_id, item.id);
          }}
        >
          ✕
        </IconButton>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {cardio ? (
          <>
            <NumberField label="km" value={item.target_distance_km} onChange={(v) => update({ target_distance_km: v })} />
            <NumberField
              label="min"
              value={item.target_duration_s === null ? null : item.target_duration_s / 60}
              onChange={(v) => update({ target_duration_s: v === null ? null : Math.round(v * 60) })}
            />
          </>
        ) : (
          <>
            <NumberField label="Sets" value={item.target_sets} onChange={(v) => update({ target_sets: v })} />
            <NumberField label="Reps" value={item.target_reps} onChange={(v) => update({ target_reps: v })} />
            <NumberField label="kg" value={item.target_weight_kg} onChange={(v) => update({ target_weight_kg: v })} />
          </>
        )}
        <NumberField
          label="Rest s"
          value={item.rest_seconds}
          onChange={(v) => update({ rest_seconds: v === null ? null : Math.round(v) })}
        />
      </div>
    </li>
  );
}
