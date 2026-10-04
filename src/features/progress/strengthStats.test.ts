import { describe, expect, it } from 'vitest';
import { exerciseRow, sessionRow } from '../../test/rows';
import type { Lift } from './progressData';
import {
  adherenceInRange,
  bestSet,
  exerciseDays,
  liftedExercises,
  repMaxTable,
  weeklySessions,
  weeklyVolume,
} from './strengthStats';

const TODAY = '2026-10-04';

function lift(id: string, date: string, extra: Partial<Lift> = {}): Lift {
  return { set_id: id, session_id: `s-${date}`, date, exercise_id: 'squat', reps: 5, weight_kg: 100, rpe: 8, ...extra };
}

describe('weeklyVolume', () => {
  it('sums reps × weight per Monday-start week and zero-fills empty weeks', () => {
    const lifts = [
      lift('a', '2026-09-14'),
      lift('b', '2026-09-20', { weight_kg: 50, reps: 10 }),
      lift('c', '2026-09-28', { weight_kg: 120, reps: 1 }),
    ];
    expect(weeklyVolume(lifts, '2026-09-14', TODAY)).toEqual([
      { week: '2026-09-14', volume: 1000 },
      { week: '2026-09-21', volume: 0 },
      { week: '2026-09-28', volume: 120 },
    ]);
  });

  it('ignores lifts outside the range', () => {
    expect(weeklyVolume([lift('a', '2026-09-07')], '2026-09-14', TODAY)[0].volume).toBe(0);
  });
});

describe('weeklySessions', () => {
  it('counts finished strength and run sessions per week; mixed counts as strength', () => {
    const sessions = [
      sessionRow('1', { date: '2026-09-28' }),
      sessionRow('2', { date: '2026-09-29', kind: 'run', status: 'partial' }),
      sessionRow('3', { date: '2026-09-30', kind: 'mixed' }),
      sessionRow('4', { date: '2026-10-01', status: 'skipped' }),
      sessionRow('5', { date: '2026-10-02', status: 'planned' }),
    ];
    expect(weeklySessions(sessions, '2026-09-28', TODAY)).toEqual([{ week: '2026-09-28', strength: 2, runs: 1 }]);
  });
});

describe('adherenceInRange', () => {
  it('counts planned sessions in the range up to today; done and partial complete them', () => {
    const sessions = [
      sessionRow('done', { date: '2026-09-28' }),
      sessionRow('partial', { date: '2026-09-29', status: 'partial' }),
      sessionRow('skipped', { date: '2026-09-30', status: 'skipped' }),
      sessionRow('missed', { date: '2026-10-01', status: 'planned' }),
      sessionRow('unplanned', { date: '2026-10-02', was_planned: false }),
      sessionRow('before', { date: '2026-09-27', status: 'skipped' }),
    ];
    expect(adherenceInRange(sessions, '2026-09-28', TODAY)).toEqual({ planned: 4, completed: 2, pct: 50 });
  });

  it('does not count today, or later days, until they are finished', () => {
    const sessions = [
      sessionRow('today', { date: TODAY, status: 'planned' }),
      sessionRow('tomorrow', { date: '2026-10-05', status: 'planned' }),
      sessionRow('today-done', { date: TODAY }),
    ];
    expect(adherenceInRange(sessions, '2026-09-28', TODAY)).toEqual({ planned: 1, completed: 1, pct: 100 });
  });
});

describe('liftedExercises', () => {
  it('lists exercises with lifts, most recently trained first, with their best e1RM', () => {
    const lifts = [
      lift('a', '2026-09-14', { exercise_id: 'bench', weight_kg: 80 }),
      lift('b', '2026-09-28', { exercise_id: 'squat', weight_kg: 100, reps: 1 }),
      lift('c', '2026-09-21', { exercise_id: 'squat', weight_kg: 90, reps: 5 }),
    ];
    const list = liftedExercises(lifts, [exerciseRow('squat', 'Back Squat'), exerciseRow('bench', 'Bench Press')]);
    expect(list.map((e) => [e.name, e.lastDate, e.sessions])).toEqual([
      ['Back Squat', '2026-09-28', 2],
      ['Bench Press', '2026-09-14', 1],
    ]);
    expect(list[0].bestE1rm).toBeCloseTo(105);
  });

  it('names an exercise missing from the library', () => {
    expect(liftedExercises([lift('a', '2026-09-14')], [])[0].name).toBe('Unknown exercise');
  });
});

describe('exerciseDays', () => {
  const lifts = [
    lift('a1', '2026-09-14', { weight_kg: 100, reps: 5, rpe: 7 }),
    lift('a2', '2026-09-14', { weight_kg: 100, reps: 5, rpe: 8 }),
    lift('b1', '2026-09-21', { weight_kg: 95, reps: 5, rpe: 8 }),
    lift('c1', '2026-09-28', { weight_kg: 105, reps: 5, rpe: 9 }),
    lift('other', '2026-09-28', { exercise_id: 'bench' }),
  ];

  it('summarises each session of one exercise, oldest first', () => {
    const days = exerciseDays(lifts, 'squat');
    expect(days.map((d) => d.date)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28']);
    expect(days[0]).toMatchObject({ volume: 1000, rpe: 7.5, topWeight: 100, sets: 2 });
    expect(days[0].e1rm).toBeCloseTo(116.667, 2);
  });

  it('marks sessions that set an e1RM record, but not the first one', () => {
    expect(exerciseDays(lifts, 'squat').map((d) => d.pr)).toEqual([false, false, true]);
  });
});

describe('bestSet and repMaxTable', () => {
  const lifts = [
    lift('a', '2026-09-14', { weight_kg: 100, reps: 5, rpe: 8 }),
    lift('b', '2026-09-21', { weight_kg: 120, reps: 1, rpe: 9.5 }),
    lift('c', '2026-09-28', { weight_kg: 105, reps: 5, rpe: 9 }),
    lift('d', '2026-09-28', { weight_kg: 60, reps: 15 }),
  ];

  it('finds the set with the highest e1RM', () => {
    expect(bestSet(lifts, 'squat')).toMatchObject({ date: '2026-09-28', weight_kg: 105, reps: 5, rpe: 9 });
  });

  it('has no best set without lifts', () => {
    expect(bestSet(lifts, 'bench')).toBeNull();
  });

  it('lists the heaviest weight for each rep count up to 12, with its date', () => {
    expect(repMaxTable(lifts, 'squat')).toEqual([
      { reps: 1, weight_kg: 120, date: '2026-09-21' },
      { reps: 5, weight_kg: 105, date: '2026-09-28' },
    ]);
  });
});
