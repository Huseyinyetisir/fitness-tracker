import { useState } from 'react';
import Button from '../../components/Button';
import { TextField } from '../../components/Fields';
import PickList from '../../components/PickList';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import type { Exercise, Local, Modality } from '../../types/domain';
import { exerciseSummary, filterExercises } from './exerciseRules';

export default function ExercisePicker({
  onPick,
  onCancel,
  modality,
}: {
  onPick: (exercise: Local<Exercise>) => void;
  onCancel: () => void;
  modality?: Modality;
}) {
  const [search, setSearch] = useState('');
  const all = useLiveQuery(() => db.exercises.toArray(), []);
  const rows = all ? filterExercises(all, { search, modality: modality ?? 'all', muscleGroup: 'all' }) : [];

  return (
    <div className="space-y-3 rounded-2xl border border-border p-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <TextField label="Find an exercise" type="search" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        <PickList
          items={rows.map((e) => ({ id: e.id, label: e.name, detail: exerciseSummary(e) }))}
          onPick={(pickedId) => {
            const exercise = rows.find((r) => r.id === pickedId);
            if (exercise) onPick(exercise);
          }}
          empty="No exercises match."
        />
      </div>
    </div>
  );
}
