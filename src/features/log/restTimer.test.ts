import { describe, it, expect } from 'vitest';
import { STALE_AFTER_MS, extendRest, isStale, parseStoredTimer, remainingSeconds, startRest } from './restTimer';

const T0 = 1_000_000;

describe('rest timer', () => {
  it('counts down from an absolute end time', () => {
    const t = startRest(T0, 90);
    expect(remainingSeconds(t, T0)).toBe(90);
    expect(remainingSeconds(t, T0 + 30_000)).toBe(60);
  });

  it('rounds partial seconds up, so it never shows 0 early', () => {
    expect(remainingSeconds(startRest(T0, 90), T0 + 89_100)).toBe(1);
  });

  it('stops at zero', () => {
    expect(remainingSeconds(startRest(T0, 90), T0 + 500_000)).toBe(0);
  });

  it('survives a long gap with no ticks, as when the screen is off', () => {
    const t = startRest(T0, 120);
    expect(remainingSeconds(t, T0 + 100_000)).toBe(20);
  });

  it('extends a running timer from its end', () => {
    const t = extendRest(startRest(T0, 60), 30, T0 + 10_000);
    expect(remainingSeconds(t, T0 + 10_000)).toBe(80);
  });

  it('extends a finished timer from now', () => {
    const t = extendRest(startRest(T0, 60), 30, T0 + 100_000);
    expect(remainingSeconds(t, T0 + 100_000)).toBe(30);
  });

  it('forgets a timer that ran out long ago', () => {
    const t = startRest(T0, 60);
    expect(isStale(t, T0 + 60_000 + STALE_AFTER_MS + 1)).toBe(true);
    expect(isStale(t, T0 + 61_000)).toBe(false);
  });

  it('reads back a stored timer and rejects garbage', () => {
    expect(parseStoredTimer(JSON.stringify({ endsAt: 5 }))).toEqual({ endsAt: 5 });
    expect(parseStoredTimer('nonsense')).toBeNull();
    expect(parseStoredTimer(null)).toBeNull();
    expect(parseStoredTimer('{"endsAt":"soon"}')).toBeNull();
  });
});
