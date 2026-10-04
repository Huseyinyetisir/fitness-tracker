import { useState } from 'react';
import { navigate } from '../../app/useRoute';
import Button from '../../components/Button';
import { TextField } from '../../components/Fields';
import Loading from '../../components/Loading';
import PickList from '../../components/PickList';
import ScreenHeader from '../../components/ScreenHeader';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import { createWorkout } from './workoutsRepo';

export default function WorkoutsScreen() {
  const [name, setName] = useState('');
  const rows = useLiveQuery(async () => {
    const templates = await db.workout_templates.where('_deleted').equals(0).toArray();
    const items = await db.workout_template_items.where('_deleted').equals(0).toArray();
    return templates
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({ template: t, count: items.filter((i) => i.template_id === t.id).length }));
  }, []);

  async function create() {
    const workout = await createWorkout(name);
    setName('');
    navigate({ name: 'workout', id: workout.id });
  }

  if (!rows) return <Loading />;

  return (
    <section>
      <ScreenHeader title="Workouts" back={{ name: 'plan' }} />
      <form
        className="mb-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="flex-1">
          <TextField label="New workout" placeholder="e.g. Push A" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="submit" variant="primary">
          Create
        </Button>
      </form>
      <PickList
        items={rows.map(({ template, count }) => ({
          id: template.id,
          label: template.name,
          detail: `${count} ${count === 1 ? 'exercise' : 'exercises'}`,
        }))}
        onPick={(id) => navigate({ name: 'workout', id })}
        empty="No workouts yet. Create one above."
      />
    </section>
  );
}
