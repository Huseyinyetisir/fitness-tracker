import { describe, it, expect } from 'vitest';
import { paceSecondsPerKm, formatPace, formatDuration } from './running';

describe('paceSecondsPerKm', () => {
  it('divides duration by distance', () => {
    expect(paceSecondsPerKm(3000, 10)).toBe(300);
  });

  it('returns 0 for zero distance rather than Infinity', () => {
    expect(paceSecondsPerKm(3000, 0)).toBe(0);
  });

  it('returns 0 for negative distance', () => {
    expect(paceSecondsPerKm(3000, -5)).toBe(0);
  });

  it('returns 0 for zero duration', () => {
    expect(paceSecondsPerKm(0, 10)).toBe(0);
  });
});

describe('formatPace', () => {
  it('formats as m:ss', () => {
    expect(formatPace(300)).toBe('5:00');
  });

  it('zero-pads seconds', () => {
    expect(formatPace(305)).toBe('5:05');
  });

  it('rounds to the nearest second', () => {
    expect(formatPace(305.6)).toBe('5:06');
  });

  it('rolls 59.6 seconds up into the next minute', () => {
    expect(formatPace(359.6)).toBe('6:00');
  });

  it('renders an em dash for zero', () => {
    expect(formatPace(0)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatDuration(1830)).toBe('30:30');
  });

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('formats zero as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });
});
