import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import type { Route } from '../../app/routes';
import { navigate } from '../../app/useRoute';
import { useSingleFlight } from '../../app/useSingleFlight';
import Button, { IconButton } from '../../components/Button';
import { NumberField, Segmented, TextAreaField, TextField } from '../../components/Fields';
import Loading from '../../components/Loading';
import NotFound from '../../components/NotFound';
import ScreenHeader from '../../components/ScreenHeader';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import { formatDateLong } from '../../lib/format';
import type { Exercise, ISODate, Local, RunSplit, Session, UUID, WorkoutTemplateItem } from '../../types/domain';
import RpeSelector from './RpeSelector';
import { draftFromRun, emptyRunDraft, pacePreview, validateRun, type RunDraft, type RunErrors } from './runRules';
import { saveRun } from './runsRepo';
import { removeSession } from './sessionsRepo';
import { loadSessionView } from './sessionView';
import { finishSession } from './setsRepo';

interface RunData {
  session: Local<Session> | null;
  date: ISODate;
  title: string;
  exercise: Local<Exercise> | undefined;
  target: Local<WorkoutTemplateItem> | undefined;
  draft: RunDraft;
}

export default function RunLogger({
  sessionId,
  exerciseId,
  date,
  from,
}: {
  sessionId?: UUID;
  exerciseId?: UUID;
  date?: ISODate;
  from?: 'log';
}) {
  const back: Route = from === 'log' ? { name: 'log' } : { name: 'today' };

  const data = useLiveQuery(async (): Promise<RunData | null> => {
    if (sessionId) {
      const view = await loadSessionView(sessionId);
      if (!view) return null;
      const cardio = view.blocks.find((b) => b.exercise?.modality === 'cardio');
      const runExerciseId = view.run?.exercise_id ?? cardio?.child.exercise_id;
      const exercise = runExerciseId ? await db.exercises.get(runExerciseId) : undefined;
      const target = view.templateItems.find((i) => i.exercise_id === runExerciseId);
      const splits: RunSplit[] = view.run
        ? (await db.run_splits.where('run_id').equals(view.run.id).toArray()).filter((s) => s._deleted === 0)
        : [];
      return {
        session: view.session,
        date: view.session.date,
        title: view.title,
        exercise,
        target,
        draft: view.run
          ? draftFromRun(view.run, splits)
          : emptyRunDraft(target?.target_distance_km ?? exercise?.default_distance_km ?? null),
      };
    }
    const exercise = exerciseId ? await db.exercises.get(exerciseId) : undefined;
    if (!exercise || !date) return null;
    return {
      session: null,
      date,
      title: exercise.name,
      exercise,
      target: undefined,
      draft: emptyRunDraft(exercise.default_distance_km),
    };
  }, [sessionId, exerciseId, date]);

  if (data === undefined) return <Loading />;
  if (data === null || !data.exercise) return <NotFound what="run" back={back} />;

  // Keyed on the run's identity so a sync re-delivering the same run does not
  // reset what the user is typing.
  return <RunForm key={data.session?.id ?? 'new'} data={data} exercise={data.exercise} back={back} />;
}

function RunForm({ data, exercise, back }: { data: RunData; exercise: Local<Exercise>; back: Route }) {
  const { requestSync } = useApp();
  const [draft, setDraft] = useState<RunDraft>(data.draft);
  const [energy, setEnergy] = useState<number | null>(data.session?.energy ?? null);
  const [notes, setNotes] = useState(data.session?.notes ?? '');
  const [errors, setErrors] = useState<RunErrors>({});
  const { busy, run } = useSingleFlight();
  const set = (patch: Partial<RunDraft>) => setDraft({ ...draft, ...patch });

  function save() {
    return run(async () => {
      const found = validateRun(draft);
      setErrors(found);
      if (Object.keys(found).length > 0) return;
      const sessionId = await saveRun({ sessionId: data.session?.id ?? null, date: data.date, exerciseId: exercise.id, draft });
      await finishSession(sessionId, { status: 'done', energy, notes: notes.trim() || null });
      requestSync();
      navigate(back);
    });
  }

  const targetKm = data.target?.target_distance_km;

  return (
    <section>
      <ScreenHeader title={data.title} back={back} />
      <p className="-mt-3 mb-4 text-sm text-muted">
        {formatDateLong(data.date)}
        {targetKm ? ` · target ${targetKm} km` : ''}
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Distance (km)" value={draft.distance} error={errors.distance} onChange={(distance) => set({ distance })} />
          <TextField
            label="Time"
            placeholder="45:30"
            inputMode="text"
            value={draft.duration}
            error={errors.duration}
            hint="45:30, 1:02:03 or minutes"
            onChange={(e) => set({ duration: e.target.value })}
          />
        </div>

        <p className="text-center">
          <span className="text-4xl font-semibold tabular-nums">{pacePreview(draft)}</span>
          <span className="ml-1 text-muted">/km</span>
        </p>

        <RpeSelector value={draft.rpe} onChange={(rpe) => set({ rpe })} />
        {errors.rpe && <p role="alert" className="text-sm text-red-400">{errors.rpe}</p>}

        <NumberField label="Average heart rate (optional)" value={draft.avgHr} error={errors.avgHr} onChange={(avgHr) => set({ avgHr })} />

        <div className="space-y-2">
          <p className="text-sm text-muted">Splits (optional)</p>
          {draft.splits.map((split, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <NumberField
                  label={`Split ${i + 1} km`}
                  value={split.distance}
                  onChange={(distance) => set({ splits: draft.splits.map((s, j) => (j === i ? { ...s, distance } : s)) })}
                />
              </div>
              <div className="flex-1">
                <TextField
                  label="Time"
                  placeholder="4:50"
                  value={split.duration}
                  onChange={(e) =>
                    set({ splits: draft.splits.map((s, j) => (j === i ? { ...s, duration: e.target.value } : s)) })
                  }
                />
              </div>
              <IconButton label={`Remove split ${i + 1}`} onClick={() => set({ splits: draft.splits.filter((_, j) => j !== i) })}>
                ✕
              </IconButton>
            </div>
          ))}
          {errors.splits && <p role="alert" className="text-sm text-red-400">{errors.splits}</p>}
          <Button onClick={() => set({ splits: [...draft.splits, { distance: 1, duration: '' }] })}>+ Add split</Button>
        </div>

        <TextField label="Weather" value={draft.weather} onChange={(e) => set({ weather: e.target.value })} />
        <TextAreaField label="Route" rows={2} value={draft.routeNote} onChange={(routeNote) => set({ routeNote })} />

        <div className="space-y-1">
          <p className="text-sm text-muted">Energy</p>
          <Segmented
            label="Energy, 1 to 5"
            value={energy === null ? '' : String(energy)}
            options={['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }))}
            onChange={(v) => setEnergy(Number(v))}
          />
        </div>
        <TextAreaField label="Notes" value={notes} onChange={setNotes} />

        <Button variant="primary" block className="min-h-14 text-lg" disabled={busy} onClick={() => void save()}>
          Save run
        </Button>

        {data.session && (
          <div className="grid grid-cols-2 gap-2">
            {data.session.status === 'planned' ? (
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await finishSession(data.session!.id, { status: 'skipped', energy: null, notes: notes.trim() || null });
                    requestSync();
                    navigate(back);
                  })
                }
              >
                Skip this run
              </Button>
            ) : (
              <span />
            )}
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (!window.confirm('Delete this session and the run logged in it?')) return;
                  await removeSession(data.session!.id);
                  requestSync();
                  navigate(back);
                })
              }
            >
              Delete
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
