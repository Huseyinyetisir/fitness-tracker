import { describe, expect, it } from 'vitest';
import { exerciseRow } from '../../test/rows';
import type { Lift, RunPoint } from './progressData';
import { fatigueAlerts, sessionLoads, volumeVsRpe, weeklyRpe } from './rpeStats';

const TODAY = '2026-10-04';

let nextSet = 0;

function lift(session: string, date: string, extra: Partial<Lift> = {}): Lift {
  return { set_id: `set-${nextSet++}`, session_id: session, date, exercise_id: 'squat', reps: 5, weight_kg: 100, rpe: 8, ...extra };
}

function run(session: string, date: string, rpe: number): RunPoint {
  return { run_id: `r-${session}`, session_id: session, date, exercise_id: 'easy', run_type: 'easy', distance_km: 5, duration_s: 1500, rpe };
}

describe('sessionLoads', () => {
  it('uses the mean working-set RPE and volume of a strength session', () => {
    const loads = sessionLoads([lift('s1', '2026-09-28', { rpe: 7 }), lift('s1', '2026-09-28', { rpe: 9 })], []);
    expect(loads).toEqual([{ session_id: 's1', date: '2026-09-28', rpe: 8, volume: 1000, kind: 'strength' }]);
  });

  it("uses the run's RPE for a run session", () => {
    expect(sessionLoads([], [run('r1', '2026-09-29', 6)])).toEqual([
      { session_id: 'r1', date: '2026-09-29', rpe: 6, volume: 0, kind: 'run' },
    ]);
  });

  it('prefers the sets in a mixed session, as the spec defines session RPE', () => {
    const loads = sessionLoads([lift('m', '2026-09-30', { rpe: 9 })], [run('m', '2026-09-30', 5)]);
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ rpe: 9, kind: 'strength' });
  });

  it('orders sessions by date', () => {
    const loads = sessionLoads([lift('b', '2026-10-01')], [run('a', '2026-09-29', 6)]);
    expect(loads.map((l) => l.session_id)).toEqual(['a', 'b']);
  });
});

describe('weeklyRpe', () => {
  it('averages session RPE per week and leaves empty weeks blank', () => {
    const loads = sessionLoads(
      [lift('s1', '2026-09-14', { rpe: 7 }), lift('s2', '2026-09-16', { rpe: 9 })],
      [run('r1', '2026-09-29', 5)],
    );
    expect(weeklyRpe(loads, '2026-09-14', TODAY)).toEqual([
      { week: '2026-09-14', rpe: 8, sessions: 2 },
      { week: '2026-09-21', rpe: null, sessions: 0 },
      { week: '2026-09-28', rpe: 5, sessions: 1 },
    ]);
  });
});

describe('volumeVsRpe', () => {
  it('plots strength sessions in the range only', () => {
    const loads = sessionLoads(
      [lift('old', '2026-08-01'), lift('s1', '2026-09-28', { rpe: 9 })],
      [run('r1', '2026-09-29', 5)],
    );
    expect(volumeVsRpe(loads, '2026-09-14', TODAY)).toEqual([{ date: '2026-09-28', volume: 500, rpe: 9 }]);
  });
});

describe('fatigueAlerts', () => {
  // Prior window 7–20 Sep at RPE 7, recent window 21 Sep–4 Oct at RPE 8, same 100 kg top set.
  const flat = [
    lift('p1', '2026-09-08', { rpe: 7 }),
    lift('p2', '2026-09-15', { rpe: 7 }),
    lift('r1', '2026-09-22', { rpe: 8 }),
    lift('r2', '2026-09-29', { rpe: 8 }),
  ];

  it('flags an exercise whose RPE rose at the same load', () => {
    const alerts = fatigueAlerts(flat, [exerciseRow('squat', 'Back Squat')], TODAY);
    expect(alerts).toEqual([{ exercise_id: 'squat', name: 'Back Squat', rpe_delta: 1, load_change_pct: 0 }]);
  });

  it('does not flag RPE rising with the load', () => {
    const heavier = flat.map((l) => (l.date >= '2026-09-21' ? { ...l, weight_kg: 110 } : l));
    expect(fatigueAlerts(heavier, [], TODAY)).toEqual([]);
  });

  it('judges each session by its top set', () => {
    const withBackOff = [...flat, lift('r2', '2026-09-29', { rpe: 8, weight_kg: 60 })];
    expect(fatigueAlerts(withBackOff, [], TODAY)).toHaveLength(1);
  });

  it('lists the biggest RPE rise first', () => {
    const bench = flat.map((l) => ({ ...l, exercise_id: 'bench', rpe: l.date >= '2026-09-21' ? 9 : 7 }));
    expect(fatigueAlerts([...flat, ...bench], [], TODAY).map((a) => a.exercise_id)).toEqual(['bench', 'squat']);
  });
});
