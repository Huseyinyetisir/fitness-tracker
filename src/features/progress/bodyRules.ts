import { inRange } from '../../lib/ranges';
import type { BodyMetric, ISODate } from '../../types/domain';

/** A body entry being typed. Numbers are null when blank and NaN when unparseable. */
export interface BodyDraft {
  date: ISODate;
  weight_kg: number | null;
  resting_hr: number | null;
  note: string;
}

export type BodyErrors = Partial<Record<'date' | 'weight_kg' | 'resting_hr', string>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `takenDates` are days that already have another live entry: one entry per day keeps each chart a single line. */
export function validateBody(draft: BodyDraft, todayDate: ISODate, takenDates: ISODate[]): BodyErrors {
  const errors: BodyErrors = {};
  if (!ISO_DATE.test(draft.date)) errors.date = 'Pick a date';
  else if (draft.date > todayDate) errors.date = 'The date cannot be in the future';
  else if (takenDates.includes(draft.date)) errors.date = 'There is already an entry for this day — edit that one';

  if (draft.weight_kg === null && draft.resting_hr === null) {
    errors.weight_kg = 'Enter a weight or a resting heart rate';
  }
  if (draft.weight_kg !== null && !(draft.weight_kg >= 20 && draft.weight_kg <= 300)) {
    errors.weight_kg = 'Weight must be 20–300 kg';
  }
  if (
    draft.resting_hr !== null &&
    !(Number.isInteger(draft.resting_hr) && draft.resting_hr >= 25 && draft.resting_hr <= 150)
  ) {
    errors.resting_hr = 'Resting heart rate must be 25–150 bpm';
  }
  return errors;
}

/** A new entry: today, with the last weight pre-filled since it rarely moves much. */
export function emptyBodyDraft(todayDate: ISODate, lastWeight: number | null): BodyDraft {
  return { date: todayDate, weight_kg: lastWeight, resting_hr: null, note: '' };
}

export interface BodyPoint {
  date: ISODate;
  value: number;
}

/** Date-ordered entries in the range, split into one series per measurement. */
export function bodySeries(rows: BodyMetric[], start: ISODate, end: ISODate): { weight: BodyPoint[]; restingHr: BodyPoint[] } {
  const inside = rows.filter((r) => inRange(r.date, start, end));
  return {
    weight: inside.flatMap((r) => (r.weight_kg === null ? [] : [{ date: r.date, value: r.weight_kg }])),
    restingHr: inside.flatMap((r) => (r.resting_hr === null ? [] : [{ date: r.date, value: r.resting_hr }])),
  };
}
