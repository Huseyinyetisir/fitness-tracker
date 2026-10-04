/** A rest timer is just its end time. Remaining time is always computed, never counted. */
export interface RestTimer {
  endsAt: number;
}

/** A timer that ran out more than this long ago is forgotten rather than shown as "rest over". */
export const STALE_AFTER_MS = 10 * 60 * 1000;

export function startRest(now: number, seconds: number): RestTimer {
  return { endsAt: now + Math.max(0, seconds) * 1000 };
}

export function remainingSeconds(timer: RestTimer, now: number): number {
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

/** Adds time to the end, or to now if the rest is already over. */
export function extendRest(timer: RestTimer, seconds: number, now: number): RestTimer {
  return { endsAt: Math.max(timer.endsAt, now) + seconds * 1000 };
}

export function isStale(timer: RestTimer, now: number): boolean {
  return now - timer.endsAt > STALE_AFTER_MS;
}

export function parseStoredTimer(raw: string | null): RestTimer | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object' && typeof (value as { endsAt?: unknown }).endsAt === 'number') {
      return { endsAt: (value as { endsAt: number }).endsAt };
    }
    return null;
  } catch {
    return null;
  }
}
