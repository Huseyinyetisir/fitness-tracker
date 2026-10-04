import { inRange, monthOf, monthsBetween, weekStarts } from '../../lib/ranges';
import { paceSecondsPerKm } from '../../lib/running';
import { startOfWeek } from '../../lib/time';
import type { ISODate, RunType } from '../../types/domain';
import type { RunPoint } from './progressData';

const within = (runs: RunPoint[], start: ISODate, end: ISODate) => runs.filter((r) => inRange(r.date, start, end));

/** Floating-point sums of decimal kilometres drift (0.1 + 0.2); two places is the stored precision. */
const km = (n: number) => Math.round(n * 100) / 100;

export interface WeekKm {
  week: ISODate;
  km: number;
  runs: number;
}

export function weeklyKm(runs: RunPoint[], start: ISODate, end: ISODate): WeekKm[] {
  const weeks = new Map(weekStarts(start, end).map((week) => [week, { week, km: 0, runs: 0 }]));
  for (const r of within(runs, start, end)) {
    const bucket = weeks.get(startOfWeek(r.date))!;
    bucket.km = km(bucket.km + r.distance_km);
    bucket.runs++;
  }
  return [...weeks.values()];
}

/** One row per run, with its pace in seconds per km under its run type — one chart line per type. */
export type PaceRow = { date: ISODate } & Partial<Record<RunType, number>>;

export function paceByType(runs: RunPoint[], start: ISODate, end: ISODate): PaceRow[] {
  return within(runs, start, end)
    .filter((r) => r.distance_km > 0 && r.duration_s > 0)
    .map((r) => ({ date: r.date, [r.run_type]: paceSecondsPerKm(r.duration_s, r.distance_km) }));
}

export function longestRun(runs: RunPoint[], start: ISODate, end: ISODate): RunPoint | null {
  return within(runs, start, end).reduce<RunPoint | null>(
    (best, r) => (!best || r.distance_km > best.distance_km ? r : best),
    null,
  );
}

export interface MonthTotal {
  /** 'YYYY-MM' */
  month: string;
  km: number;
  runs: number;
  duration_s: number;
}

export function monthlyTotals(runs: RunPoint[], start: ISODate, end: ISODate): MonthTotal[] {
  const months = new Map(monthsBetween(start, end).map((month) => [month, { month, km: 0, runs: 0, duration_s: 0 }]));
  for (const r of within(runs, start, end)) {
    const bucket = months.get(monthOf(r.date))!;
    bucket.km = km(bucket.km + r.distance_km);
    bucket.runs++;
    bucket.duration_s += r.duration_s;
  }
  return [...months.values()];
}

export function paceVsRpe(
  runs: RunPoint[],
  start: ISODate,
  end: ISODate,
): { date: ISODate; pace: number; rpe: number; run_type: RunType }[] {
  return within(runs, start, end)
    .filter((r) => r.distance_km > 0 && r.duration_s > 0)
    .map((r) => ({ date: r.date, pace: paceSecondsPerKm(r.duration_s, r.distance_km), rpe: r.rpe, run_type: r.run_type }));
}

export function runTotals(runs: RunPoint[], start: ISODate, end: ISODate): { km: number; runs: number; duration_s: number } {
  const inside = within(runs, start, end);
  return {
    km: km(inside.reduce((sum, r) => sum + r.distance_km, 0)),
    runs: inside.length,
    duration_s: inside.reduce((sum, r) => sum + r.duration_s, 0),
  };
}
