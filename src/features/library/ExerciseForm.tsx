import { useState } from 'react';
import { navigate } from '../../app/useRoute';
import Button from '../../components/Button';
import { NumberField, SelectField, Segmented, TextField } from '../../components/Fields';
import Loading from '../../components/Loading';
import NotFound from '../../components/NotFound';
import ScreenHeader from '../../components/ScreenHeader';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import type { Modality, RunType, UUID } from '../../types/domain';
import {
  EMPTY_EXERCISE,
  RUN_TYPE_LABELS,
  muscleGroups,
  toInput,
  validateExercise,
  type ExerciseErrors,
  type ExerciseInput,
} from './exerciseRules';
import { createExercise, deleteExercise, duplicateExercise, updateExercise } from './exercisesRepo';

export default function ExerciseForm({ id }: { id: UUID | 'new' }) {
  const data = useLiveQuery(async () => {
    const all = await db.exercises.toArray();
    const existing = id === 'new' ? null : (all.find((e) => e.id === id && e._deleted === 0) ?? null);
    return { existing, groups: muscleGroups(all) };
  }, [id]);

  if (!data) return <Loading />;
  if (id !== 'new' && !data.existing) return <NotFound what="exercise" back={{ name: 'library' }} />;

  return (
    <FormBody
      id={id}
      initial={data.existing ? toInput(data.existing) : EMPTY_EXERCISE}
      groups={data.groups}
    />
  );
}

function FormBody({ id, initial, groups }: { id: UUID | 'new'; initial: ExerciseInput; groups: string[] }) {
  const [input, setInput] = useState<ExerciseInput>(initial);
  const [errors, setErrors] = useState<ExerciseErrors>({});
  const set = (patch: Partial<ExerciseInput>) => setInput({ ...input, ...patch });
  const cardio = input.modality === 'cardio';

  async function save() {
    const found = validateExercise(input);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (id === 'new') await createExercise(input);
    else await updateExercise(id, input);
    navigate({ name: 'library' });
  }

  return (
    <section>
      <ScreenHeader title={id === 'new' ? 'New exercise' : input.name || 'Exercise'} back={{ name: 'library' }} />
      <div className="space-y-4">
        <TextField label="Name" value={input.name} error={errors.name} onChange={(e) => set({ name: e.target.value })} />
        <Segmented<Modality>
          label="Type"
          value={input.modality}
          options={[
            { value: 'strength', label: 'Strength' },
            { value: 'cardio', label: 'Cardio' },
          ]}
          onChange={(modality) => set({ modality, run_type: modality === 'cardio' ? (input.run_type ?? 'easy') : null })}
        />

        {cardio ? (
          <>
            <SelectField
              label="Run type"
              value={input.run_type ?? 'easy'}
              options={Object.entries(RUN_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={(v) => set({ run_type: v as RunType })}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Distance (km)"
                value={input.default_distance_km}
                error={errors.default_distance_km}
                onChange={(v) => set({ default_distance_km: v })}
              />
              <NumberField
                label="Duration (min)"
                value={input.default_duration_s === null ? null : input.default_duration_s / 60}
                error={errors.default_duration_s}
                onChange={(v) => set({ default_duration_s: v === null ? null : Math.round(v * 60) })}
              />
            </div>
          </>
        ) : (
          <>
            <TextField
              label="Muscle group"
              list="muscle-groups"
              value={input.muscle_group ?? ''}
              onChange={(e) => set({ muscle_group: e.target.value })}
            />
            <datalist id="muscle-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <div className="grid grid-cols-3 gap-3">
              <NumberField label="Sets" value={input.default_sets} error={errors.default_sets} onChange={(v) => set({ default_sets: v })} />
              <NumberField label="Reps" value={input.default_reps} error={errors.default_reps} onChange={(v) => set({ default_reps: v })} />
              <NumberField label="kg" value={input.default_weight_kg} error={errors.default_weight_kg} onChange={(v) => set({ default_weight_kg: v })} />
            </div>
          </>
        )}

        <Button variant="primary" block onClick={() => void save()}>
          Save
        </Button>

        {id !== 'new' && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={async () => {
                const copy = await duplicateExercise(id);
                navigate({ name: 'exercise', id: copy.id });
              }}
            >
              Duplicate
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!window.confirm(`Delete ${input.name}? Workouts and history that use it keep working.`)) return;
                await deleteExercise(id);
                navigate({ name: 'library' });
              }}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
