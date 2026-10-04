import { inRange, weekStarts } from '../../lib/ranges';
import { fatigueFlag, type LoadPoint } from '../../lib/rpe';
import { startOfWeek } from '../../lib/time';
import type { Exercise, ISODate, UUID } from '../../types/domain';
import type { Lift, RunPoint } from './progressData';

/** One session's effort: its RPE and, for strength, its volume. */
export interface SessionLoad {
  session_id: UUID;
  date: ISODate;
  rpe: number;
  volume: number;
  kind: 'strength' | 'run';
}

/**
 * Session RPE as the spec defines it: the mean RPE of the working sets, or
 * the run's RPE for a session with no sets. Oldest first.
 */
export function sessionLoads(lifts: Lift[], runs: RunPoint[]): SessionLoad[] {
  const bySession = new Map<UUID, Lift[]>();
  for (const l of lifts) bySession.set(l.session_id, [...(bySession.get(l.session_id) ?? []), l]);

  const loads: SessionLoad[] = [...bySession].map(([session_id, sets]) => ({
    session_id,
    date: sets[0].date,
    rpe: sets.reduce((sum, s) => sum + s.rpe, 0) / sets.length,
    volume: sets.reduce((sum, s) => sum + s.reps * s.weight_kg, 0),
    kind: 'strength',
  }));
  for (const r of runs) {
    if (bySession.has(r.session_id)) continue;
    loads.push({ session_id: r.session_id, date: r.date, rpe: r.rpe, volume: 0, kind: 'run' });
  }
  return loads.sort((a, b) => a.date.localeCompare(b.date));
}

export interface WeekRpe {
  week: ISODate;
  /** Mean session RPE, or null for a week with no sessions — a gap, not a zero. */
  rpe: number | null;
  sessions: number;
}

export function weeklyRpe(loads: SessionLoad[], start: ISODate, end: ISODate): WeekRpe[] {
  const weeks = new Map(weekStarts(start, end).map((week) => [week, [] as number[]]));
  for (const l of loads) if (inRange(l.date, start, end)) weeks.get(startOfWeek(l.date))!.push(l.rpe);
  return [...weeks].map(([week, rpes]) => ({
    week,
    rpe: rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null,
    sessions: rpes.length,
  }));
}

/** Strength sessions in the range, for a volume-against-RPE scatter. */
export function volumeVsRpe(loads: SessionLoad[], start: ISODate, end: ISODate): { date: ISODate; volume: number; rpe: number }[] {
  return loads
    .filter((l) => l.kind === 'strength' && inRange(l.date, start, end))
    .map(({ date, volume, rpe }) => ({ date, volume, rpe }));
}

export interface FatigueAlert {
  exercise_id: UUID;
  name: string;
  rpe_delta: number;
  load_change_pct: number;
}

/**
 * Exercises where the same weight is getting harder: the fatigue flag from
 * lib/rpe over the last two weeks against the two before. Each session counts
 * once, with its mean RPE and its top-set weight. Biggest RPE rise first.
 */
export function fatigueAlerts(lifts: Lift[], exercises: Exercise[], todayDate: ISODate): FatigueAlert[] {
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  const sessionsByExercise = new Map<UUID, Map<UUID, Lift[]>>();
  for (const l of lifts) {
    const sessions = sessionsByExercise.get(l.exercise_id) ?? new Map<UUID, Lift[]>();
    sessions.set(l.session_id, [...(sessions.get(l.session_id) ?? []), l]);
    sessionsByExercise.set(l.exercise_id, sessions);
  }

  const alerts: FatigueAlert[] = [];
  for (const [exercise_id, sessions] of sessionsByExercise) {
    const points: LoadPoint[] = [...sessions.values()].map((sets) => ({
      date: sets[0].date,
      rpe: sets.reduce((sum, s) => sum + s.rpe, 0) / sets.length,
      top_set_load: Math.max(...sets.map((s) => s.weight_kg)),
    }));
    const result = fatigueFlag(points, todayDate);
    if (result.flagged && result.rpe_delta !== null && result.load_change_pct !== null) {
      alerts.push({
        exercise_id,
        name: names.get(exercise_id) ?? 'Unknown exercise',
        rpe_delta: result.rpe_delta,
        load_change_pct: result.load_change_pct,
      });
    }
  }
  return alerts.sort((a, b) => b.rpe_delta - a.rpe_delta);
}
