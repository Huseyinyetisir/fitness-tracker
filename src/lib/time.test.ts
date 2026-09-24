import { describe, it, expect } from 'vitest';
import {
  toISODate,
  addDays,
  weekdayIndex,
  startOfWeek,
  eachDateInRange,
  isWeekdayDate,
  daysBetween,
} from './time';

describe('toISODate', () => {
  it('formats a date as YYYY-MM-DD in local time', () => {
    expect(toISODate(new Date(2026, 8, 22))).toBe('2026-09-22');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('weekdayIndex', () => {
  it('numbers Monday as 1', () => {
    expect(weekdayIndex('2026-09-21')).toBe(1);
  });

  it('numbers Sunday as 7', () => {
    expect(weekdayIndex('2026-09-27')).toBe(7);
  });
});

describe('startOfWeek', () => {
  it('returns the same day for a Monday', () => {
    expect(startOfWeek('2026-09-21')).toBe('2026-09-21');
  });

  it('returns the preceding Monday for a Sunday', () => {
    expect(startOfWeek('2026-09-27')).toBe('2026-09-21');
  });

  it('returns the preceding Monday for a midweek day', () => {
    expect(startOfWeek('2026-09-24')).toBe('2026-09-21');
  });
});

describe('addDays', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('subtracts days with a negative offset', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
  });
});

describe('eachDateInRange', () => {
  it('returns an inclusive range', () => {
    expect(eachDateInRange('2026-09-21', '2026-09-24')).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
    ]);
  });

  it('returns a single date when start equals end', () => {
    expect(eachDateInRange('2026-09-21', '2026-09-21')).toEqual(['2026-09-21']);
  });
});

describe('isWeekdayDate', () => {
  it('is true for Monday through Friday', () => {
    expect(isWeekdayDate('2026-09-25')).toBe(true);
  });

  it('is false for Saturday and Sunday', () => {
    expect(isWeekdayDate('2026-09-26')).toBe(false);
    expect(isWeekdayDate('2026-09-27')).toBe(false);
  });
});

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-09-21', '2026-09-24')).toBe(3);
  });

  it('is negative when the second date is earlier', () => {
    expect(daysBetween('2026-09-24', '2026-09-21')).toBe(-3);
  });
});
