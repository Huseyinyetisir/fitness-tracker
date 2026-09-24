import type { SetEntry } from '../types/domain';

/** The highest rep count tracked as a rep-max PR. */
export const MAX_TRACKED_REPS = 12;

export function isWorkingSet(s: SetEntry): boolean {
  return !s.is_warmup && s.deleted_at === null;
}

/** Epley: weight * (1 + reps / 30). Exact at 1 rep. */
export function epley1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export function setVolume(s: SetEntry): number {
  return s.reps * s.weight_kg;
}

export function totalVolume(sets: SetEntry[]): number {
  return sets.filter(isWorkingSet).reduce((sum, s) => sum + setVolume(s), 0);
}

export function bestE1RM(sets: SetEntry[]): number {
  return sets
    .filter(isWorkingSet)
    .reduce((best, s) => Math.max(best, epley1RM(s.weight_kg, s.reps)), 0);
}

/** Best weight lifted for each rep count from 1 to MAX_TRACKED_REPS. */
export function repMaxes(sets: SetEntry[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of sets) {
    if (!isWorkingSet(s)) continue;
    if (s.reps < 1 || s.reps > MAX_TRACKED_REPS) continue;
    const prev = out.get(s.reps) ?? 0;
    if (s.weight_kg > prev) out.set(s.reps, s.weight_kg);
  }
  return out;
}
