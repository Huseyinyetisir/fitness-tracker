import { describe, it, expect } from 'vitest';
import { adherence, weekdayStreak, type SessionSummary } from './adherence';

function s(date: string, status: SessionSummary['status'], was_planned = true): SessionSummary {
  return { date, status, was_planned };
}

describe('adherence', () => {
  it('counts done and partial against planned', () => {
    const r = adherence([
      s('2026-09-21', 'done'),
      s('2026-09-22', 'partial'),
      s('2026-09-23', 'skipped'),
      s('2026-09-24', 'planned'),
    ]);
    expect(r).toEqual({ planned: 4, completed: 2, pct: 50 });
  });

  it('excludes unplanned sessions from the denominator', () => {
    const r = adherence([s('2026-09-21', 'done'), s('2026-09-22', 'done', false)]);
    expect(r).toEqual({ planned: 1, completed: 1, pct: 100 });
  });

  it('returns 0 pct rather than NaN when nothing was planned', () => {
    expect(adherence([])).toEqual({ planned: 0, completed: 0, pct: 0 });
  });

  it('rounds the percentage to one decimal', () => {
    const r = adherence([s('a', 'done'), s('b', 'skipped'), s('c', 'skipped')]);
    expect(r.pct).toBe(33.3);
  });
});

describe('weekdayStreak', () => {
  it('counts consecutive completed weekdays', () => {
    // Mon 21 – Wed 23 done, asked on Wed 23
    const sessions = [s('2026-09-21', 'done'), s('2026-09-22', 'done'), s('2026-09-23', 'done')];
    expect(weekdayStreak(sessions, '2026-09-23')).toBe(3);
  });

  it('treats weekends as neutral', () => {
    // Fri 18 and Mon 21 done; the weekend between must not break it
    const sessions = [s('2026-09-18', 'done'), s('2026-09-21', 'done')];
    expect(weekdayStreak(sessions, '2026-09-21')).toBe(2);
  });

  it('breaks on a skipped weekday', () => {
    const sessions = [
      s('2026-09-21', 'done'),
      s('2026-09-22', 'skipped'),
      s('2026-09-23', 'done'),
    ];
    expect(weekdayStreak(sessions, '2026-09-23')).toBe(1);
  });

  it('breaks on a weekday with no session at all', () => {
    const sessions = [s('2026-09-21', 'done'), s('2026-09-23', 'done')];
    expect(weekdayStreak(sessions, '2026-09-23')).toBe(1);
  });

  it('gives today a grace day when it is not yet logged', () => {
    // Mon+Tue done, asked on Wed before training
    const sessions = [s('2026-09-21', 'done'), s('2026-09-22', 'done')];
    expect(weekdayStreak(sessions, '2026-09-23')).toBe(2);
  });

  it('gives no grace day to a date before today', () => {
    const sessions = [s('2026-09-21', 'done')];
    expect(weekdayStreak(sessions, '2026-09-23')).toBe(0);
  });

  it('counts partial sessions as completed', () => {
    expect(weekdayStreak([s('2026-09-21', 'partial')], '2026-09-21')).toBe(1);
  });

  it('returns 0 for no sessions', () => {
    expect(weekdayStreak([], '2026-09-23')).toBe(0);
  });
});
