import type { ISODate } from '../types/domain';
import { addDays, parseISODate } from './time';

/** English UI, metric units, 24-hour clock. */
const LOCALE = 'en-GB';

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export function formatKg(kg: number): string {
  return `${kg.toLocaleString(LOCALE, { maximumFractionDigits: 2 })} kg`;
}

export function formatKm(km: number): string {
  return `${km.toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} km`;
}

/** "Sunday 4 October" */
export function formatDateLong(date: ISODate): string {
  return parseISODate(date).toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** "Mon 5" */
export function formatDayShort(date: ISODate): string {
  return parseISODate(date).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric' });
}

/** "5–11 Oct", or "26 Oct – 1 Nov" across a month boundary. */
export function formatWeekRange(weekStart: ISODate): string {
  const start = parseISODate(weekStart);
  const end = parseISODate(addDays(weekStart, 6));
  const month = (d: Date) => d.toLocaleDateString(LOCALE, { month: 'short' });
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${month(end)}`;
  }
  return `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)}`;
}

/**
 * Parses a number field. Blank means "no value"; anything unparseable is NaN
 * so validation can reject it. A decimal comma is accepted because many
 * phone keyboards — Turkish ones included — offer only a comma.
 */
export function parseOptionalNumber(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : Number.NaN;
}

/** A typed value to commit, or null while it is not yet a usable number within [min, max]. */
export function parseInRange(text: string, min: number, max: number): number | null {
  const parsed = parseOptionalNumber(text);
  if (parsed === null || !Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return Math.round(parsed * 100) / 100;
}
