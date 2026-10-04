import { useCallback, useEffect, useRef, useState } from 'react';
import { routeHref } from '../../app/routes';
import { useSingleFlight } from '../../app/useSingleFlight';
import Button, { PRIMARY_LINK } from '../../components/Button';
import { Checkbox, TextAreaField } from '../../components/Fields';
import Stepper from '../../components/Stepper';
import { useLiveQuery } from '../../db/useLiveQuery';
import { formatKg } from '../../lib/format';
import type { Session, UUID } from '../../types/domain';
import { nextSetDraft, sameAsLastSet } from './prefill';
import RpeSelector from './RpeSelector';
import { loadLastTime, type ExerciseBlock } from './sessionView';
import { validateSet, type SetDraft, type SetErrors } from './setRules';
import { deleteSet, logSet, removeExerciseFromSession, setExerciseNote, updateSet } from './setsRepo';

export default function ExercisePanel({
  block,
  session,
  from,
  onLogged,
  onRemoved,
}: {
  block: ExerciseBlock;
  session: Session;
  /** Carried to the run logger so the Log tab stays highlighted when opened from history. */
  from?: 'log';
  onLogged: () => void;
  onRemoved: () => void;
}) {
  const { child, exercise, sets } = block;
  const name = exercise?.name ?? 'Exercise';
  const lastTime = useLiveQuery(
    () => loadLastTime(child.exercise_id, session.id, session.date),
    [child.exercise_id, session.id, session.date],
  );
  const [editing, setEditing] = useState<UUID | null>(null);
  const [draft, setDraft] = useState<SetDraft | null>(null);
  const [errors, setErrors] = useState<SetErrors>({});
  const { busy, run } = useSingleFlight();

  // Recompute the suggested set when the exercise, any logged set, or last
  // time's sets change — but never while a logged set is being edited, and not
  // just because a sync re-delivered identical data. The sets key covers each
  // set's content, so editing a set or its warm-up flag refreshes the draft.
  const setsKey = sets.map((s) => `${s.id}:${s.reps}:${s.weight_kg}:${s.rpe}:${s.is_warmup}`).join(',');
  const lastTimeKey = lastTime?.map((s) => s.id).join(',');
  useEffect(() => {
    if (editing || lastTime === undefined) return;
    setDraft(
      nextSetDraft({
        logged: sets,
        lastTime,
        targetReps: child.target_reps,
        targetWeightKg: child.target_weight_kg,
        defaultReps: exercise?.default_reps ?? null,
        defaultWeightKg: exercise?.default_weight_kg ?? null,
      }),
    );
    setErrors({});
  }, [child.id, setsKey, lastTimeKey, editing]);

  // The note saves 800 ms after the last keystroke, and at once on blur or
  // unmount: switching apps on Android may never blur the field, so saving
  // only on blur could lose it.
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNote = useRef<string | null>(null);
  const savedNote = useRef(child.notes ?? '');
  const flushNote = useCallback(() => {
    if (noteTimer.current !== null) {
      clearTimeout(noteTimer.current);
      noteTimer.current = null;
    }
    const value = pendingNote.current;
    pendingNote.current = null;
    if (value === null || value.trim() === savedNote.current) return;
    savedNote.current = value.trim();
    void setExerciseNote(child.id, value);
  }, [child.id]);
  useEffect(() => flushNote, [flushNote]);

  if (exercise?.modality === 'cardio') {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <p className="text-lg font-semibold">{name}</p>
        <a href={routeHref({ name: 'run', id: session.id, ...(from ? { from } : {}) })} className={PRIMARY_LINK}>
          Log this run
        </a>
      </div>
    );
  }

  function submit() {
    return run(async () => {
      if (!draft) return;
      const found = validateSet(draft);
      setErrors(found);
      if (Object.keys(found).length > 0) return;
      if (editing) {
        await updateSet(editing, draft);
        setEditing(null);
      } else {
        await logSet(child.id, draft);
        onLogged();
      }
    });
  }

  let workingNumber = 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{name}</h2>
        {lastTime && lastTime.length > 0 && (
          <p className="text-sm text-muted">Last time: {lastTime.map((s) => `${s.reps}×${s.weight_kg}`).join(', ')}</p>
        )}
      </div>

      {sets.length > 0 && (
        <ol className="space-y-1">
          {sets.map((s) => {
            if (!s.is_warmup) workingNumber++;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(s.id);
                    setDraft({ reps: s.reps, weight_kg: s.weight_kg, rpe: s.rpe, is_warmup: s.is_warmup });
                    setErrors({});
                  }}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 ${editing === s.id ? 'bg-accent/15' : 'bg-surface'}`}
                >
                  <span className="w-16 text-left text-sm text-muted">{s.is_warmup ? 'Warm-up' : `Set ${workingNumber}`}</span>
                  <span className="flex-1 text-left tabular-nums">
                    {s.reps} × {formatKg(s.weight_kg)}
                  </span>
                  <span className="text-sm tabular-nums">RPE {s.rpe}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {draft && (
        <div className="space-y-4 rounded-2xl border border-border p-3">
          <p className="text-sm text-muted">{editing ? 'Edit set' : 'Next set'}</p>
          <Stepper label="Reps" value={draft.reps} step={1} min={1} max={100} onChange={(reps) => setDraft({ ...draft, reps })} />
          {errors.reps && <p role="alert" className="text-sm text-red-400">{errors.reps}</p>}
          <Stepper label="kg" value={draft.weight_kg} step={2.5} min={0} max={1000} onChange={(weight_kg) => setDraft({ ...draft, weight_kg })} />
          {errors.weight_kg && <p role="alert" className="text-sm text-red-400">{errors.weight_kg}</p>}
          <RpeSelector value={draft.rpe} onChange={(rpe) => setDraft({ ...draft, rpe })} />
          {errors.rpe && <p role="alert" className="text-sm text-red-400">{errors.rpe}</p>}
          <Checkbox label="Warm-up set" checked={draft.is_warmup} onChange={(is_warmup) => setDraft({ ...draft, is_warmup })} />

          {editing ? (
            <div className="grid grid-cols-3 gap-2">
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (!window.confirm('Delete this set?')) return;
                    await deleteSet(editing);
                    setEditing(null);
                  })
                }
              >
                Delete
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => void submit()}>
                Save
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <Button
                disabled={sameAsLastSet(sets) === null}
                onClick={() => {
                  const copy = sameAsLastSet(sets);
                  if (copy) setDraft(copy);
                }}
              >
                Same as last
              </Button>
              <Button variant="primary" className="min-h-14 text-lg" disabled={busy} onClick={() => void submit()}>
                Log set
              </Button>
            </div>
          )}
        </div>
      )}

      <TextAreaField
        key={child.id}
        label="Exercise note"
        rows={2}
        defaultValue={child.notes ?? ''}
        onChange={(value) => {
          pendingNote.current = value;
          if (noteTimer.current !== null) clearTimeout(noteTimer.current);
          noteTimer.current = setTimeout(flushNote, 800);
        }}
        onBlur={(value) => {
          pendingNote.current = value;
          flushNote();
        }}
      />

      <Button
        variant="ghost"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            if (!window.confirm(`Remove ${name} and its sets from this session?`)) return;
            await removeExerciseFromSession(child.id);
            onRemoved();
          })
        }
      >
        Remove exercise
      </Button>
    </div>
  );
}
