import { useState } from 'react';
import { useSingleFlight } from '../../app/useSingleFlight';
import { navigate } from '../../app/useRoute';
import Button from '../../components/Button';
import { NumberField, TextField } from '../../components/Fields';
import Loading from '../../components/Loading';
import NotFound from '../../components/NotFound';
import ScreenHeader from '../../components/ScreenHeader';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import { today } from '../../lib/time';
import type { UUID } from '../../types/domain';
import { deleteBodyMetric, saveBodyMetric } from './bodyRepo';
import { emptyBodyDraft, validateBody, type BodyDraft, type BodyErrors } from './bodyRules';

const BACK = { name: 'progress', view: 'body' } as const;

export default function BodyForm({ id }: { id: UUID | 'new' }) {
  const todayDate = today();
  const data = useLiveQuery(async () => {
    const live = (await db.body_metrics.where('_deleted').equals(0).toArray()).sort((a, b) => a.date.localeCompare(b.date));
    return { existing: id === 'new' ? null : (live.find((b) => b.id === id) ?? null), live };
  }, [id]);

  if (!data) return <Loading />;
  if (id !== 'new' && !data.existing) return <NotFound what="entry" back={BACK} />;

  const lastWeight = data.live.filter((b) => b.weight_kg !== null).at(-1)?.weight_kg ?? null;
  const initial: BodyDraft = data.existing
    ? {
        date: data.existing.date,
        weight_kg: data.existing.weight_kg,
        resting_hr: data.existing.resting_hr,
        note: data.existing.note ?? '',
      }
    : emptyBodyDraft(todayDate, lastWeight);
  const takenDates = data.live.filter((b) => b.id !== id).map((b) => b.date);

  return <FormBody id={id} initial={initial} takenDates={takenDates} todayDate={todayDate} />;
}

function FormBody({
  id,
  initial,
  takenDates,
  todayDate,
}: {
  id: UUID | 'new';
  initial: BodyDraft;
  takenDates: string[];
  todayDate: string;
}) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<BodyErrors>({});
  const { busy, run } = useSingleFlight();
  const set = (patch: Partial<BodyDraft>) => setDraft({ ...draft, ...patch });

  function save() {
    return run(async () => {
      const found = validateBody(draft, todayDate, takenDates);
      setErrors(found);
      if (Object.keys(found).length > 0) return;
      await saveBodyMetric(id === 'new' ? null : id, draft, todayDate);
      navigate(BACK, { replace: true });
    });
  }

  return (
    <section>
      <ScreenHeader title={id === 'new' ? 'New body entry' : 'Body entry'} back={BACK} />
      <div className="space-y-4">
        <TextField
          label="Date"
          type="date"
          max={todayDate}
          value={draft.date}
          error={errors.date}
          onChange={(e) => set({ date: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Weight (kg)" value={draft.weight_kg} error={errors.weight_kg} onChange={(weight_kg) => set({ weight_kg })} />
          <NumberField
            label="Resting HR (bpm)"
            value={draft.resting_hr}
            error={errors.resting_hr}
            onChange={(resting_hr) => set({ resting_hr })}
          />
        </div>
        <TextField label="Note" value={draft.note} onChange={(e) => set({ note: e.target.value })} />
        <Button variant="primary" block disabled={busy} onClick={() => void save()}>
          Save
        </Button>
        {id !== 'new' && (
          <Button
            variant="danger"
            block
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (!window.confirm('Delete this body entry?')) return;
                await deleteBodyMetric(id);
                navigate(BACK, { replace: true });
              })
            }
          >
            Delete entry
          </Button>
        )}
      </div>
    </section>
  );
}
