import { describe, it, expect } from 'vitest';
import { base } from '../../test/fixtures';
import type { Session, SessionExercise, SetEntry } from '../../types/domain';
import { lastTimeSets, nextSetDraft, sameAsLastSet } from './prefill';

function session(id: string, date: string, extra: Partial<Session> = {}): Session {
  return {
    ...base(id),
    date,
    kind: 'strength',
    status: 'done',
    template_id: null,
    was_planned: true,
    energy: null,
    notes: null,
    started_at: null,
    completed_at: `${date}T07:00:00.000Z`,
    ...extra,
  };
}

function child(id: string, sessionId: string, exerciseId = 'squat'): SessionExercise {
  return {
    ...base(id),
    session_id: sessionId,
    exercise_id: exerciseId,
    position: 0,
    notes: null,
    target_sets: 3,
    target_reps: 5,
    target_weight_kg: 100,
  };
}

function set(id: string, childId: string, setIndex: number, reps: number, weight: number, extra: Partial<SetEntry> = {}): SetEntry {
  return {
    ...base(id),
    session_exercise_id: childId,
    set_index: setIndex,
    reps,
    weight_kg: weight,
    rpe: 8,
    is_warmup: false,
    notes: null,
    ...extra,
  };
}

describe('lastTimeSets', () => {
  const sessions = [
    session('old', '2026-09-28'),
    session('recent', '2026-10-01'),
    session('now', '2026-10-05'),
    session('future', '2026-10-09'),
    session('gone', '2026-10-03', { deleted_at: '2026-10-03T08:00:00.000Z' }),
  ];
  const children = [
    child('c-old', 'old'),
    child('c-recent', 'recent'),
    child('c-now', 'now'),
    child('c-future', 'future'),
    child('c-gone', 'gone'),
  ];
  const sets = [
    set('o1', 'c-old', 0, 5, 90),
    set('r2', 'c-recent', 1, 5, 102.5),
    set('r1', 'c-recent', 0, 5, 100),
    set('rw', 'c-recent', 2, 10, 40, { is_warmup: true }),
    set('n1', 'c-now', 0, 5, 105),
    set('f1', 'c-future', 0, 5, 200),
    set('g1', 'c-gone', 0, 5, 150),
  ];
  const args = { exerciseId: 'squat', currentSessionId: 'now', currentDate: '2026-10-05', sessions, sessionExercises: children, sets };

  it('returns the most recent earlier session, working sets only, in order', () => {
    expect(lastTimeSets(args).map((s) => s.id)).toEqual(['r1', 'r2']);
  });

  it('skips a session where only warm-ups were logged', () => {
    const warmupsOnly = sets.map((s) => (s.session_exercise_id === 'c-recent' ? { ...s, is_warmup: true } : s));
    expect(lastTimeSets({ ...args, sets: warmupsOnly }).map((s) => s.id)).toEqual(['o1']);
  });

  it('returns nothing for an exercise never done before', () => {
    expect(lastTimeSets({ ...args, exerciseId: 'deadlift' })).toEqual([]);
  });
});

describe('nextSetDraft', () => {
  const lastTime = [set('a', 'x', 0, 5, 100), set('b', 'x', 1, 5, 102.5)];
  const targets = { targetReps: 8, targetWeightKg: 60, defaultReps: 10, defaultWeightKg: 40 };

  it('suggests the same set as last time, by position', () => {
    expect(nextSetDraft({ logged: [set('n', 'y', 0, 5, 100)], lastTime, ...targets })).toEqual({
      reps: 5,
      weight_kg: 102.5,
      rpe: null,
      is_warmup: false,
    });
  });

  it('repeats the previous set once past last time', () => {
    const logged = [set('n1', 'y', 0, 5, 100), set('n2', 'y', 1, 5, 102.5), set('n3', 'y', 2, 4, 105)];
    expect(nextSetDraft({ logged, lastTime, ...targets })).toMatchObject({ reps: 4, weight_kg: 105 });
  });

  it('ignores warm-ups when counting position', () => {
    const logged = [set('w', 'y', 0, 10, 40, { is_warmup: true })];
    expect(nextSetDraft({ logged, lastTime, ...targets })).toMatchObject({ reps: 5, weight_kg: 100 });
  });

  it('falls back to the targets, then the exercise defaults', () => {
    expect(nextSetDraft({ logged: [], lastTime: [], ...targets })).toMatchObject({ reps: 8, weight_kg: 60 });
    expect(
      nextSetDraft({ logged: [], lastTime: [], targetReps: null, targetWeightKg: null, defaultReps: 10, defaultWeightKg: 40 }),
    ).toMatchObject({ reps: 10, weight_kg: 40 });
    expect(
      nextSetDraft({ logged: [], lastTime: [], targetReps: null, targetWeightKg: null, defaultReps: null, defaultWeightKg: null }),
    ).toMatchObject({ reps: 5, weight_kg: 0 });
  });

  it('never pre-fills the RPE — every set must be rated', () => {
    expect(nextSetDraft({ logged: [], lastTime, ...targets }).rpe).toBeNull();
  });
});

describe('sameAsLastSet', () => {
  it('copies the last set, RPE included, because the user asked for it', () => {
    const logged = [set('a', 'y', 0, 5, 100, { rpe: 7 }), set('b', 'y', 1, 5, 102.5, { rpe: 8.5 })];
    expect(sameAsLastSet(logged)).toEqual({ reps: 5, weight_kg: 102.5, rpe: 8.5, is_warmup: false });
  });

  it('ignores deleted sets', () => {
    const logged = [set('a', 'y', 0, 5, 100), set('b', 'y', 1, 3, 120, { deleted_at: '2026-10-05T07:00:00.000Z' })];
    expect(sameAsLastSet(logged)).toMatchObject({ reps: 5, weight_kg: 100 });
  });

  it('is null before anything is logged', () => {
    expect(sameAsLastSet([])).toBeNull();
  });
});
