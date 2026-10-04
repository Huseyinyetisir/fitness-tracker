import { useState } from 'react';
import { routeHref } from '../../app/routes';
import { navigate } from '../../app/useRoute';
import { SelectField, Segmented, TextField } from '../../components/Fields';
import Loading from '../../components/Loading';
import PickList from '../../components/PickList';
import ScreenHeader from '../../components/ScreenHeader';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import type { Modality } from '../../types/domain';
import { NO_FILTER, exerciseSummary, filterExercises, muscleGroups, type ExerciseFilter } from './exerciseRules';

export default function LibraryScreen() {
  const [filter, setFilter] = useState<ExerciseFilter>(NO_FILTER);
  const all = useLiveQuery(() => db.exercises.toArray(), []);

  if (!all) return <Loading />;
  const rows = filterExercises(all, filter);

  return (
    <section>
      <ScreenHeader
        title="Exercise library"
        back={{ name: 'plan' }}
        action={
          <a href={routeHref({ name: 'exercise', id: 'new' })} className="min-h-12 content-center px-2 text-accent">
            + New
          </a>
        }
      />
      <div className="mb-4 space-y-3">
        <TextField
          label="Search"
          type="search"
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
        />
        <Segmented<Modality | 'all'>
          label="Type"
          value={filter.modality}
          options={[
            { value: 'all', label: 'All' },
            { value: 'strength', label: 'Strength' },
            { value: 'cardio', label: 'Cardio' },
          ]}
          onChange={(modality) => setFilter({ ...filter, modality })}
        />
        <SelectField
          label="Muscle group"
          value={filter.muscleGroup}
          options={[
            { value: 'all', label: 'All muscle groups' },
            ...muscleGroups(all).map((g) => ({ value: g, label: g })),
          ]}
          onChange={(muscleGroup) => setFilter({ ...filter, muscleGroup })}
        />
      </div>
      <PickList
        items={rows.map((e) => ({ id: e.id, label: e.name, detail: exerciseSummary(e) }))}
        onPick={(id) => navigate({ name: 'exercise', id })}
        empty="No exercises match."
      />
    </section>
  );
}
