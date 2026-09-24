import type { ISODate, UUID } from '../types/domain';
import { epley1RM, MAX_TRACKED_REPS } from './strength';

/** A set flattened with the date of its session — what PR detection needs. */
export interface DatedSet {
  set_id: UUID;
  date: ISODate;
  reps: number;
  weight_kg: number;
  is_warmup: boolean;
}

export type PRKind = 'e1rm' | 'rep_max';

export interface PREvent {
  date: ISODate;
  kind: PRKind;
  reps: number;
  value: number;
  set_id: UUID;
}

/**
 * Walks sets in chronological order and emits an event each time a running
 * best is beaten. Emits rep_max before e1rm for a given set so the order is
 * deterministic. Ties do not count as PRs — the bar has to actually move.
 */
export function detectPRs(sets: DatedSet[]): PREvent[] {
  const working = sets
    .filter((s) => !s.is_warmup && s.weight_kg > 0 && s.reps > 0)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const events: PREvent[] = [];
  const bestByReps = new Map<number, number>();
  let bestE1RM = 0;

  for (const s of working) {
    if (s.reps <= MAX_TRACKED_REPS) {
      const prev = bestByReps.get(s.reps) ?? 0;
      if (s.weight_kg > prev) {
        bestByReps.set(s.reps, s.weight_kg);
        events.push({
          date: s.date,
          kind: 'rep_max',
          reps: s.reps,
          value: s.weight_kg,
          set_id: s.set_id,
        });
      }
    }

    const e = epley1RM(s.weight_kg, s.reps);
    if (e > bestE1RM) {
      bestE1RM = e;
      events.push({ date: s.date, kind: 'e1rm', reps: s.reps, value: e, set_id: s.set_id });
    }
  }

  return events;
}
