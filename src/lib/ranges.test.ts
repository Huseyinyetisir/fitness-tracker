import { describe, expect, it } from 'vitest';
import { inRange, isRangeKey, monthOf, monthsBetween, rangeStart, weekStarts } from './ranges';

// Sunday 4 October 2026; its week starts Monday 28 September.
const TODAY = '2026-10-04';

describe('rangeStart', () => {
  it('covers whole Monday-start weeks ending with this one', () => {
    expect(rangeStart('4w', TODAY, null)).toBe('2026-09-07');
    expect(rangeStart('12w', TODAY, null)).toBe('2026-07-13');
    expect(rangeStart('6m', TODAY, null)).toBe('2026-04-06');
  });

  it('starts "all" at the Monday of the earliest data', () => {
    expect(rangeStart('all', TODAY, '2026-03-12')).toBe('2026-03-09');
  });

  it('starts "all" this week when there is no data, or none before it', () => {
    expect(rangeStart('all', TODAY, null)).toBe('2026-09-28');
    expect(rangeStart('all', TODAY, '2026-10-02')).toBe('2026-09-28');
  });
});

describe('weekStarts', () => {
  it('lists every Monday from the first week to the last', () => {
    expect(weekStarts('2026-09-14', TODAY)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28']);
  });

  it('starts from the Monday of a mid-week date', () => {
    expect(weekStarts('2026-09-30', '2026-10-06')).toEqual(['2026-09-28', '2026-10-05']);
  });
});

describe('months', () => {
  it('reads the month of a date', () => {
    expect(monthOf('2026-10-04')).toBe('2026-10');
  });

  it('lists months across a year boundary', () => {
    expect(monthsBetween('2025-11-20', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('helpers', () => {
  it('checks dates inclusively', () => {
    expect(inRange('2026-09-28', '2026-09-28', TODAY)).toBe(true);
    expect(inRange(TODAY, '2026-09-28', TODAY)).toBe(true);
    expect(inRange('2026-10-05', '2026-09-28', TODAY)).toBe(false);
  });

  it('recognises range keys', () => {
    expect(isRangeKey('12w')).toBe(true);
    expect(isRangeKey('1y')).toBe(false);
    expect(isRangeKey(null)).toBe(false);
  });
});
