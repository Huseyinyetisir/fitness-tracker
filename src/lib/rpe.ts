import type { ISODate, SetEntry } from '../types/domain';
import { addDays } from './time';
import { isWorkingSet } from './strength';

/** RPE increase, in points, that counts as a fatigue signal. */
export const FATIGUE_RPE_DELTA = 0.5;
/** Load increase, as a fraction, still considered "flat". */
export const FATIGUE_FLAT_LOAD_PCT = 0.01;
/** Length of each comparison window, in days. */
export const FATIGUE_WINDOW_DAYS = 14;

export function meanRPE(sets: SetEntry[]): number | null {
  const working = sets.filter(isWorkingSet);
  if (working.length === 0) return null;
  const sum = working.reduce((acc, s) => acc + s.rpe, 0);
  return sum / working.length;
}

/** One session's RPE and top-set load for a single exercise. */
export interface LoadPoint {
  date: ISODate;
  rpe: number;
  top_set_load: number;
}

export interface FatigueResult {
  flagged: boolean;
  /** Recent mean RPE minus prior mean RPE. Null when a window is empty. */
  rpe_delta: number | null;
  /** Fractional change in mean top-set load. Null when a window is empty. */
  load_change_pct: number | null;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Compares the trailing 14 days against the 14 days before them. Raised when
 * mean RPE climbs by at least FATIGUE_RPE_DELTA while mean top-set load stays
 * flat — the classic "same weight is getting harder" signal.
 *
 * Both windows must contain data; with only one window populated there is
 * nothing to compare and the flag stays down.
 */
export function fatigueFlag(points: LoadPoint[], asOf: ISODate): FatigueResult {
  const recentStart = addDays(asOf, -FATIGUE_WINDOW_DAYS + 1);
  const priorStart = addDays(asOf, -FATIGUE_WINDOW_DAYS * 2 + 1);

  const recent = points.filter((p) => p.date >= recentStart && p.date <= asOf);
  const prior = points.filter((p) => p.date >= priorStart && p.date < recentStart);

  if (recent.length === 0 || prior.length === 0) {
    return { flagged: false, rpe_delta: null, load_change_pct: null };
  }

  const rpeDelta = mean(recent.map((p) => p.rpe)) - mean(prior.map((p) => p.rpe));
  const priorLoad = mean(prior.map((p) => p.top_set_load));
  const recentLoad = mean(recent.map((p) => p.top_set_load));
  const loadChange = priorLoad === 0 ? 0 : (recentLoad - priorLoad) / priorLoad;

  return {
    flagged: rpeDelta >= FATIGUE_RPE_DELTA && loadChange <= FATIGUE_FLAT_LOAD_PCT,
    rpe_delta: rpeDelta,
    load_change_pct: loadChange,
  };
}
