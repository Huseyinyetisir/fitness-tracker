import { describe, expect, it } from 'vitest';
import { bodySeries, emptyBodyDraft, validateBody } from './bodyRules';
import { bodyRow } from '../../test/rows';

const TODAY = '2026-10-04';

describe('validateBody', () => {
  const draft = { date: TODAY, weight_kg: 81.4, resting_hr: 55, note: '' };

  it('accepts a weight, a resting heart rate, or both', () => {
    expect(validateBody(draft, TODAY, [])).toEqual({});
    expect(validateBody({ ...draft, resting_hr: null }, TODAY, [])).toEqual({});
    expect(validateBody({ ...draft, weight_kg: null }, TODAY, [])).toEqual({});
  });

  it('needs at least one measurement', () => {
    expect(validateBody({ ...draft, weight_kg: null, resting_hr: null }, TODAY, [])).toEqual({
      weight_kg: 'Enter a weight or a resting heart rate',
    });
  });

  it('rejects implausible or unparseable values', () => {
    expect(validateBody({ ...draft, weight_kg: 12 }, TODAY, []).weight_kg).toBe('Weight must be 20–300 kg');
    expect(validateBody({ ...draft, weight_kg: Number.NaN }, TODAY, []).weight_kg).toBe('Weight must be 20–300 kg');
    expect(validateBody({ ...draft, resting_hr: 210 }, TODAY, []).resting_hr).toBe('Resting heart rate must be 25–150 bpm');
    expect(validateBody({ ...draft, resting_hr: 55.5 }, TODAY, []).resting_hr).toBe('Resting heart rate must be 25–150 bpm');
  });

  it('rejects a missing or future date', () => {
    expect(validateBody({ ...draft, date: '' }, TODAY, []).date).toBe('Pick a date');
    expect(validateBody({ ...draft, date: '2026-10-05' }, TODAY, []).date).toBe('The date cannot be in the future');
  });

  it('allows one entry per day', () => {
    expect(validateBody(draft, TODAY, [TODAY]).date).toBe('There is already an entry for this day — edit that one');
  });
});

describe('emptyBodyDraft', () => {
  it('starts today, carrying the last weight forward', () => {
    expect(emptyBodyDraft(TODAY, 80.2)).toEqual({ date: TODAY, weight_kg: 80.2, resting_hr: null, note: '' });
  });
});

describe('bodySeries', () => {
  it('splits entries into a weight series and a resting heart rate series within the range', () => {
    const rows = [
      bodyRow('a', '2026-09-01', { weight_kg: 82 }),
      bodyRow('b', '2026-09-20', { weight_kg: 81, resting_hr: 56 }),
      bodyRow('c', '2026-09-27', { resting_hr: 54 }),
    ];
    expect(bodySeries(rows, '2026-09-14', TODAY)).toEqual({
      weight: [{ date: '2026-09-20', value: 81 }],
      restingHr: [
        { date: '2026-09-20', value: 56 },
        { date: '2026-09-27', value: 54 },
      ],
    });
  });
});
