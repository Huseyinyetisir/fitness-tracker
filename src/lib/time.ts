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

export function nowISO(): string {
  return new Date().toISOString();
}
