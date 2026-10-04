import { describe, expect, it } from 'vitest';
import type { RunPoint } from './progressData';
import { longestRun, monthlyTotals, paceByType, paceVsRpe, runTotals, weeklyKm } from './runStats';

const TODAY = '2026-10-04';

function run(id: string, date: string, extra: Partial<RunPoint> = {}): RunPoint {
  return {
    run_id: id,
    session_id: `s-${id}`,
    date,
    exercise_id: 'easy',
    run_type: 'easy',
    distance_km: 5,
    duration_s: 1500,
    rpe: 6,
    ...extra,
  };
}

const runs = [
  run('old', '2026-08-30', { distance_km: 20, duration_s: 7200 }),
  run('a', '2026-09-15', { distance_km: 8, duration_s: 2880 }),
  run('b', '2026-09-17', { run_type: 'tempo', distance_km: 6, duration_s: 1680, rpe: 8 }),
  run('c', '2026-09-30', { run_type: 'long', distance_km: 14.5, duration_s: 5220, rpe: 7 }),
  run('zero', '2026-10-01', { distance_km: 0, duration_s: 600 }),
];

describe('weeklyKm', () => {
  it('sums distance and counts runs per week, zero-filled', () => {
    expect(weeklyKm(runs, '2026-09-14', TODAY)).toEqual([
      { week: '2026-09-14', km: 14, runs: 2 },
      { week: '2026-09-21', km: 0, runs: 0 },
      { week: '2026-09-28', km: 14.5, runs: 2 },
    ]);
  });
});

describe('paceByType', () => {
  it('gives each run its pace under its own type, skipping runs with no distance', () => {
    expect(paceByType(runs, '2026-09-14', TODAY)).toEqual([
      { date: '2026-09-15', easy: 360 },
      { date: '2026-09-17', tempo: 280 },
      { date: '2026-09-30', long: 360 },
    ]);
  });
});

describe('longestRun', () => {
  it('finds the longest run in the range', () => {
    expect(longestRun(runs, '2026-09-14', TODAY)?.run_id).toBe('c');
    expect(longestRun(runs, '2026-08-01', TODAY)?.run_id).toBe('old');
  });

  it('is null with no runs', () => {
    expect(longestRun([], '2026-09-14', TODAY)).toBeNull();
  });
});

describe('monthlyTotals', () => {
  it('totals each month of the range, empty months included', () => {
    expect(monthlyTotals(runs, '2026-07-27', TODAY)).toEqual([
      { month: '2026-07', km: 0, runs: 0, duration_s: 0 },
      { month: '2026-08', km: 20, runs: 1, duration_s: 7200 },
      { month: '2026-09', km: 28.5, runs: 3, duration_s: 9780 },
      { month: '2026-10', km: 0, runs: 1, duration_s: 600 },
    ]);
  });
});

describe('paceVsRpe and runTotals', () => {
  it('plots pace against RPE for runs with a distance', () => {
    expect(paceVsRpe(runs, '2026-09-14', TODAY)).toEqual([
      { date: '2026-09-15', pace: 360, rpe: 6, run_type: 'easy' },
      { date: '2026-09-17', pace: 280, rpe: 8, run_type: 'tempo' },
      { date: '2026-09-30', pace: 360, rpe: 7, run_type: 'long' },
    ]);
  });

  it('totals the range', () => {
    expect(runTotals(runs, '2026-09-14', TODAY)).toEqual({ km: 28.5, runs: 4, duration_s: 10380 });
  });
});
