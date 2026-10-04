import type { ISODate } from '../types/domain';
import { addDays, startOfWeek } from './time';

/** The Progress range filter: 4 weeks, 12 weeks, 6 months, everything. */
export type RangeKey = '4w' | '12w' | '6m' | 'all';

export const RANGE_KEYS: readonly RangeKey[] = ['4w', '12w', '6m', 'all'];
export const DEFAULT_RANGE: RangeKey = '12w';
export const RANGE_LABELS: Record<RangeKey, string> = { '4w': '4 wk', '12w': '12 wk', '6m': '6 mo', all: 'All' };

/** Six months is taken as 26 whole weeks. */
const RANGE_WEEKS = { '4w': 4, '12w': 12, '6m': 26 } as const;

export function isRangeKey(value: string | null): value is RangeKey {
  return value !== null && (RANGE_KEYS as readonly string[]).includes(value);
}

/**
 * The first day a range covers. Ranges are whole Monday-start weeks ending
 * with the current one, so a weekly chart never opens on a partial week.
 * "All" starts at the week of the earliest data, or this week when there is none.
 */
export function rangeStart(range: RangeKey, todayDate: ISODate, earliest: ISODate | null): ISODate {
  const thisWeek = startOfWeek(todayDate);
  if (range === 'all') return earliest && earliest < thisWeek ? startOfWeek(earliest) : thisWeek;
  return addDays(thisWeek, -7 * (RANGE_WEEKS[range] - 1));
}

export function inRange(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end;
}

/** The Monday of every week from the one containing `start` to the one containing `end`. */
export function weekStarts(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let week = startOfWeek(start); week <= end; week = addDays(week, 7)) out.push(week);
  return out;
}

/** 'YYYY-MM' */
export function monthOf(date: ISODate): string {
  return date.slice(0, 7);
}

/** Every 'YYYY-MM' from the month of `start` to the month of `end`. */
export function monthsBetween(start: ISODate, end: ISODate): string[] {
  const out: string[] = [];
  let [year, month] = start.split('-').map(Number);
  const last = monthOf(end);
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    out.push(key);
    if (key >= last) return out;
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
}
