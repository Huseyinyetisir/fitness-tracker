import type { ISODate, Weekday } from '../types/domain';

/**
 * All date maths here works on local-time calendar dates, not UTC instants.
 * A workout logged at 06:30 local belongs to that local calendar day, and
 * UTC conversion would move it across midnight for part of the year.
 */

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** 1 = Monday … 7 = Sunday */
export function weekdayIndex(s: ISODate): Weekday {
  const js = parseISODate(s).getDay(); // 0 = Sunday
  return (js === 0 ? 7 : js) as Weekday;
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Monday of the week containing `s`. */
export function startOfWeek(s: ISODate): ISODate {
  return addDays(s, -(weekdayIndex(s) - 1));
}

export function eachDateInRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function isWeekdayDate(s: ISODate): boolean {
  return weekdayIndex(s) <= 5;
}

export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

let lastIssuedMs = 0;

/**
 * Wall-clock time, forced to strictly increase within this JS context.
 *
 * `updated_at` is not just a timestamp — it is the version token that
 * last-write-wins compares and that the push path uses to detect a row
 * edited mid-flight. `Date.now()` has 1ms resolution, so two writes in the
 * same millisecond produce an identical token: the merge reads them as a tie
 * and drops one, and the dirty-flag guard cannot tell them apart. Advancing
 * by at least 1ms per call makes every local write distinguishable and
 * correctly ordered.
 *
 * Drift is bounded by the number of writes in a burst — seeding the library
 * is ~51 calls, so ~51ms. A backward system-clock jump is deliberately not
 * followed, which is what last-write-wins wants.
 */
export function nowISO(): string {
  const ms = Math.max(Date.now(), lastIssuedMs + 1);
  lastIssuedMs = ms;
  return new Date(ms).toISOString();
}

/**
 * System writes — defaults and rows the app derives from the plan — are
 * stamped fifty years in the past. Last-write-wins then ranks every genuine
 * user edit, on any device, above any system write, while system writes still
 * order correctly among themselves.
 */
const SYSTEM_OFFSET_MS = 50 * 365.25 * 24 * 60 * 60 * 1000;
/** System timestamps fall before this instant and real ones after it, until 2050. */
const SYSTEM_BOUNDARY_MS = Date.UTC(2000, 0, 1);

let lastSystemMs = 0;

/** Like nowISO(), strictly increasing, but in the system-write range. */
export function systemISO(): string {
  const ms = Math.max(Date.now() - SYSTEM_OFFSET_MS, lastSystemMs + 1);
  lastSystemMs = ms;
  return new Date(ms).toISOString();
}

export function isSystemTimestamp(ts: string): boolean {
  return Date.parse(ts) < SYSTEM_BOUNDARY_MS;
}
