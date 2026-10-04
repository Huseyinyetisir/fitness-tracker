import { describe, it, expect } from 'vitest';
import {
  WEEKDAY_NAMES,
  formatDateLong,
  formatDayShort,
  formatKg,
  formatKm,
  formatMonth,
  formatNumber,
  formatShortDate,
  formatWeekRange,
  parseOptionalNumber,
} from './format';

describe('formatKg', () => {
  it('groups thousands', () => {
    expect(formatKg(4200)).toBe('4,200 kg');
  });

  it('keeps fractional plates', () => {
    expect(formatKg(102.5)).toBe('102.5 kg');
  });
});

describe('formatKm', () => {
  it('always shows one decimal place', () => {
    expect(formatKm(8)).toBe('8.0 km');
  });

  it('shows up to two', () => {
    expect(formatKm(10.55)).toBe('10.55 km');
  });
});

describe('dates', () => {
  it('formats a long date', () => {
    expect(formatDateLong('2026-10-04')).toBe('Sunday 4 October');
  });

  it('formats a short day', () => {
    expect(formatDayShort('2026-10-05')).toBe('Mon 5');
  });

  it('formats a week inside one month', () => {
    expect(formatWeekRange('2026-10-05')).toBe('5–11 Oct');
  });

  it('formats a week across two months', () => {
    expect(formatWeekRange('2026-10-26')).toBe('26 Oct – 1 Nov');
  });

  it('names weekdays Monday first', () => {
    expect(WEEKDAY_NAMES[0]).toBe('Monday');
    expect(WEEKDAY_NAMES[6]).toBe('Sunday');
  });
});

describe('parseOptionalNumber', () => {
  it('treats blank as no value', () => {
    expect(parseOptionalNumber('  ')).toBeNull();
  });

  it('parses integers and decimals', () => {
    expect(parseOptionalNumber('12')).toBe(12);
    expect(parseOptionalNumber('2.5')).toBe(2.5);
  });

  it('accepts a decimal comma', () => {
    expect(parseOptionalNumber('2,5')).toBe(2.5);
  });

  it('accepts a number still being typed', () => {
    expect(parseOptionalNumber('5.')).toBe(5);
  });

  it('returns NaN for text, so validation can flag it', () => {
    expect(parseOptionalNumber('abc')).toBeNaN();
  });
});

describe('chart labels', () => {
  it('formats a short date', () => {
    expect(formatShortDate('2026-10-05')).toBe('5 Oct');
  });

  it('formats a month key', () => {
    expect(formatMonth('2026-11')).toBe('Nov 2026');
  });

  it('formats whole numbers with grouping', () => {
    expect(formatNumber(12345.6)).toBe('12,346');
  });

  it('keeps the decimals asked for', () => {
    expect(formatNumber(7.25, 1)).toBe('7.3');
  });
});
