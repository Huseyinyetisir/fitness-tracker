import { db } from '../../db/schema';
import { isWorkingSet } from '../../lib/strength';
import type {
  BodyMetric,
  Exercise,
  ISODate,
  Run,
  RunType,
  Session,
  SessionExercise,
  SetEntry,
  UUID,
} from '../../types/domain';

/** One working set, flattened with its session's date and its exercise. */
export interface Lift {
  set_id: UUID;
  session_id: UUID;
  date: ISODate;
  exercise_id: UUID;
  reps: number;
  weight_kg: number;
  rpe: number;
}

/** One run, flattened with its session's date. */
export interface RunPoint {
  run_id: UUID;
  session_id: UUID;
  date: ISODate;
  exercise_id: UUID;
  run_type: RunType;
  distance_km: number;
  duration_s: number;
  rpe: number;
}

/** Everything the Progress tab draws from, already cleaned of deleted rows. */
export interface ProgressData {
  /** Live sessions of every status, oldest first. */
  sessions: Session[];
  /** Working sets only — warm-ups never count towards any chart. Oldest first. */
  lifts: Lift[];
  runs: RunPoint[];
  /** Every exercise, deleted ones included, so old history keeps its names. */
  exercises: Exercise[];
  body: BodyMetric[];
  /** The first date with anything to show, for the "All" range. Null with no data. */
  earliest: ISODate | null;
}

export interface ProgressRaw {
  sessions: Session[];
  children: SessionExercise[];
  sets: SetEntry[];
  runs: Run[];
  exercises: Exercise[];
  body: BodyMetric[];
}

const byDate = <T extends { date: ISODate }>(a: T, b: T) => a.date.localeCompare(b.date);

export function buildProgressData(raw: ProgressRaw, todayDate: ISODate): ProgressData {
  const sessions = raw.sessions.filter((s) => s.deleted_at === null).sort(byDate);
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const childById = new Map(
    raw.children.filter((c) => c.deleted_at === null && sessionById.has(c.session_id)).map((c) => [c.id, c]),
  );

  const lifts: Lift[] = raw.sets
    .filter((s) => isWorkingSet(s) && childById.has(s.session_exercise_id))
    .sort((a, b) => a.set_index - b.set_index)
    .map((s) => {
      const child = childById.get(s.session_exercise_id)!;
      return {
        set_id: s.id,
        session_id: child.session_id,
        date: sessionById.get(child.session_id)!.date,
        exercise_id: child.exercise_id,
        reps: s.reps,
        weight_kg: s.weight_kg,
        rpe: s.rpe,
      };
    })
    .sort(byDate);

  const runs: RunPoint[] = raw.runs
    .filter((r) => r.deleted_at === null && sessionById.has(r.session_id))
    .map((r) => ({
      run_id: r.id,
      session_id: r.session_id,
      date: sessionById.get(r.session_id)!.date,
      exercise_id: r.exercise_id,
      run_type: r.run_type,
      distance_km: r.distance_km,
      duration_s: r.duration_s,
      rpe: r.rpe,
    }))
    .sort(byDate);

  const body = raw.body.filter((b) => b.deleted_at === null).sort(byDate);

  const dates = [
    ...lifts.map((l) => l.date),
    ...runs.map((r) => r.date),
    ...body.map((b) => b.date),
    ...sessions.map((s) => s.date),
  ].filter((d) => d <= todayDate);
  const earliest = dates.length > 0 ? dates.reduce((min, d) => (d < min ? d : min)) : null;

  return { sessions, lifts, runs, exercises: raw.exercises, body, earliest };
}

/** Reads everything Progress needs. Safe inside useLiveQuery. */
export async function loadProgressData(todayDate: ISODate): Promise<ProgressData> {
  const [sessions, children, sets, runs, exercises, body] = await Promise.all([
    db.sessions.where('_deleted').equals(0).toArray(),
    db.session_exercises.where('_deleted').equals(0).toArray(),
    db.set_entries.where('_deleted').equals(0).toArray(),
    db.runs.where('_deleted').equals(0).toArray(),
    db.exercises.toArray(),
    db.body_metrics.where('_deleted').equals(0).toArray(),
  ]);
  return buildProgressData({ sessions, children, sets, runs, exercises, body }, todayDate);
}
