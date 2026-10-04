import { describe, it, expect } from 'vitest';
import { isSystemTimestamp, nowISO, systemISO } from './time';

describe('systemISO', () => {
  it('strictly increases, even within one millisecond', () => {
    const stamps = Array.from({ length: 20 }, () => systemISO());
    expect(new Set(stamps).size).toBe(stamps.length);
    expect([...stamps].sort()).toEqual(stamps);
  });

  it('is always older than a real timestamp', () => {
    expect(Date.parse(systemISO())).toBeLessThan(Date.parse(nowISO()));
  });

  it('is recognised as a system timestamp', () => {
    expect(isSystemTimestamp(systemISO())).toBe(true);
  });
});

describe('isSystemTimestamp', () => {
  it('rejects a real timestamp', () => {
    expect(isSystemTimestamp(nowISO())).toBe(false);
  });

  it('recognises the Postgres rendering of a system timestamp', () => {
    expect(isSystemTimestamp('1976-10-04T10:00:00.123456+00:00')).toBe(true);
  });
});
