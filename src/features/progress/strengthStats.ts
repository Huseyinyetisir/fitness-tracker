import { adherence, type AdherenceResult } from '../../lib/adherence';
import { detectPRs } from '../../lib/prs';
import { inRange, weekStarts } from '../../lib/ranges';
import { epley1RM, MAX_TRACKED_REPS } from '../../lib/strength';
import { startOfWeek } from '../../lib/time';
import type { Exercise, ISODate, Session, UUID } from '../../types/domain';
import type { Lift } from './progressData';

export interface WeekVolume {
  week: ISODate;
  volume: number;
}

/** Working-set volume (reps × kg) for every week of the range, empty weeks included. */
export function weeklyVolume(lifts: Lift[], start: ISODate, end: ISODate): WeekVolume[] {
  const totals = new Map(weekStarts(start, end).map((week) => [week, 0]));
  for (const l of lifts) {
    if (!inRange(l.date, start, end)) continue;
    const week = startOfWeek(l.date);
    totals.set(week, (totals.get(week) ?? 0) + l.reps * l.weight_kg);
  }
  return [...totals].map(([week, volume]) => ({ week, volume }));
}

export interface WeekSessions {
  week: ISODate;
  strength: number;
  runs: number;
}

const isCompleted = (s: Session) => s.status === 'done' || s.status === 'partial';

/** Finished sessions per week. A mixed session counts once, as strength. */
export function weeklySessions(sessions: Session[], start: ISODate, end: ISODate): WeekSessions[] {
  const weeks = new Map(weekStarts(start, end).map((week) => [week, { week, strength: 0, runs: 0 }]));
  for (const s of sessions) {
    if (!isCompleted(s) || !inRange(s.date, start, end)) continue;
    const bucket = weeks.get(startOfWeek(s.date))!;
    if (s.kind === 'run') bucket.runs++;
    else bucket.strength++;
  }
  return [...weeks.values()];
}

/**
 * Adherence over the range, up to today. A session planned for today counts
 * only once it is finished — the day is not over — and later days not at all.
 */
export function adherenceInRange(sessions: Session[], start: ISODate, todayDate: ISODate): AdherenceResult {
  return adherence(
    sessions.filter(
      (s) => inRange(s.date, start, todayDate) && !(s.date === todayDate && s.status === 'planned'),
    ),
  );
}

export interface ExerciseSummary {
  exercise_id: UUID;
  name: string;
  /** Sessions the exercise was trained in. */
  sessions: number;
  lastDate: ISODate;
  bestE1rm: number;
}

/** Every exercise with at least one working set, most recently trained first. */
export function liftedExercises(lifts: Lift[], exercises: Exercise[]): ExerciseSummary[] {
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  const byExercise = new Map<UUID, { sessions: Set<UUID>; lastDate: ISODate; bestE1rm: number }>();
  for (const l of lifts) {
    const entry = byExercise.get(l.exercise_id) ?? { sessions: new Set<UUID>(), lastDate: l.date, bestE1rm: 0 };
    entry.sessions.add(l.session_id);
    if (l.date > entry.lastDate) entry.lastDate = l.date;
    entry.bestE1rm = Math.max(entry.bestE1rm, epley1RM(l.weight_kg, l.reps));
    byExercise.set(l.exercise_id, entry);
  }
  return [...byExercise]
    .map(([exercise_id, e]) => ({
      exercise_id,
      name: names.get(exercise_id) ?? 'Unknown exercise',
      sessions: e.sessions.size,
      lastDate: e.lastDate,
      bestE1rm: e.bestE1rm,
    }))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
}

export interface ExerciseDay {
  date: ISODate;
  session_id: UUID;
  /** Best estimated 1RM of the session. */
  e1rm: number;
  volume: number;
  /** Mean RPE of the session's working sets. */
  rpe: number;
  topWeight: number;
  sets: number;
  /** The session beat every earlier e1RM for this exercise. */
  pr: boolean;
}

/**
 * One exercise, session by session, oldest first. PRs are judged against all
 * history, so a record is a record whatever range is on screen. The first
 * session is never a PR: it has nothing to beat.
 */
export function exerciseDays(lifts: Lift[], exerciseId: UUID): ExerciseDay[] {
  const own = lifts.filter((l) => l.exercise_id === exerciseId);
  const prSets = new Set(
    detectPRs(own.map((l) => ({ ...l, is_warmup: false })))
      .filter((e) => e.kind === 'e1rm')
      .map((e) => e.set_id),
  );

  const sessions = new Map<UUID, Lift[]>();
  for (const l of own) sessions.set(l.session_id, [...(sessions.get(l.session_id) ?? []), l]);

  return [...sessions]
    .map(([session_id, sets]) => ({
      date: sets[0].date,
      session_id,
      e1rm: Math.max(...sets.map((s) => epley1RM(s.weight_kg, s.reps))),
      volume: sets.reduce((sum, s) => sum + s.reps * s.weight_kg, 0),
      rpe: sets.reduce((sum, s) => sum + s.rpe, 0) / sets.length,
      topWeight: Math.max(...sets.map((s) => s.weight_kg)),
      sets: sets.length,
      pr: sets.some((s) => prSets.has(s.set_id)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day, i) => (i === 0 ? { ...day, pr: false } : day));
}

export interface BestSet {
  date: ISODate;
  reps: number;
  weight_kg: number;
  rpe: number;
  e1rm: number;
}

/** The set with the highest estimated 1RM; the earliest wins a tie. */
export function bestSet(lifts: Lift[], exerciseId: UUID): BestSet | null {
  let best: BestSet | null = null;
  for (const l of lifts) {
    if (l.exercise_id !== exerciseId) continue;
    const e1rm = epley1RM(l.weight_kg, l.reps);
    if (!best || e1rm > best.e1rm) best = { date: l.date, reps: l.reps, weight_kg: l.weight_kg, rpe: l.rpe, e1rm };
  }
  return best;
}

export interface RepMax {
  reps: number;
  weight_kg: number;
  date: ISODate;
}

/** The heaviest weight lifted for each rep count from 1 to 12, first achieved. */
export function repMaxTable(lifts: Lift[], exerciseId: UUID): RepMax[] {
  const best = new Map<number, RepMax>();
  for (const l of lifts) {
    if (l.exercise_id !== exerciseId || l.reps < 1 || l.reps > MAX_TRACKED_REPS || l.weight_kg <= 0) continue;
    const current = best.get(l.reps);
    if (!current || l.weight_kg > current.weight_kg) best.set(l.reps, { reps: l.reps, weight_kg: l.weight_kg, date: l.date });
  }
  return [...best.values()].sort((a, b) => a.reps - b.reps);
}
