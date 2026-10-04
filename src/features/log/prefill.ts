import { isWorkingSet } from '../../lib/strength';
import type { ISODate, Session, SessionExercise, SetEntry, UUID } from '../../types/domain';
import type { SetDraft } from './setRules';

const bySetIndex = (a: SetEntry, b: SetEntry) => a.set_index - b.set_index;

/**
 * The working sets from the most recent other session, on or before this
 * one's date, in which this exercise was actually trained.
 */
export function lastTimeSets<S extends SetEntry>(args: {
  exerciseId: UUID;
  currentSessionId: UUID;
  currentDate: ISODate;
  sessions: Session[];
  sessionExercises: SessionExercise[];
  sets: S[];
}): S[] {
  const sessionById = new Map(args.sessions.map((s) => [s.id, s]));

  const candidates = args.sessionExercises
    .filter((c) => c.exercise_id === args.exerciseId && c.deleted_at === null && c.session_id !== args.currentSessionId)
    .map((c) => ({
      session: sessionById.get(c.session_id),
      sets: args.sets.filter((s) => s.session_exercise_id === c.id && isWorkingSet(s)),
    }))
    .filter(
      (c): c is { session: Session; sets: S[] } =>
        c.session !== undefined &&
        c.session.deleted_at === null &&
        c.session.date <= args.currentDate &&
        c.sets.length > 0,
    )
    .sort(
      (a, b) =>
        b.session.date.localeCompare(a.session.date) ||
        (b.session.completed_at ?? b.session.updated_at).localeCompare(a.session.completed_at ?? a.session.updated_at),
    );

  return candidates.length > 0 ? [...candidates[0].sets].sort(bySetIndex) : [];
}

/**
 * The next set to suggest: the same-numbered set from last time; failing
 * that, a repeat of the previous set; failing that, the targets or the
 * exercise's defaults. The RPE is always left blank so every set is rated.
 */
export function nextSetDraft(args: {
  logged: SetEntry[];
  lastTime: SetEntry[];
  targetReps: number | null;
  targetWeightKg: number | null;
  defaultReps: number | null;
  defaultWeightKg: number | null;
}): SetDraft {
  const working = args.logged.filter(isWorkingSet).sort(bySetIndex);
  const fromLastTime = args.lastTime[working.length];
  if (fromLastTime) return { reps: fromLastTime.reps, weight_kg: fromLastTime.weight_kg, rpe: null, is_warmup: false };

  const previous = working.at(-1);
  if (previous) return { reps: previous.reps, weight_kg: previous.weight_kg, rpe: null, is_warmup: false };

  return {
    reps: args.targetReps ?? args.defaultReps ?? 5,
    weight_kg: args.targetWeightKg ?? args.defaultWeightKg ?? 0,
    rpe: null,
    is_warmup: false,
  };
}

/** The "same as last set" button: a copy of the previous set, RPE included. */
export function sameAsLastSet(logged: SetEntry[]): SetDraft | null {
  const last = logged.filter((s) => s.deleted_at === null).sort(bySetIndex).at(-1);
  return last ? { reps: last.reps, weight_kg: last.weight_kg, rpe: last.rpe, is_warmup: last.is_warmup } : null;
}
