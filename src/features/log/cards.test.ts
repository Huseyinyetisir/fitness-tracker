import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { base, makeExercise, makeWorkout, resetDb } from '../../test/fixtures';
import type { Exercise, Local, Run, Session, SessionExercise, SetEntry } from '../../types/domain';
import { buildCards, loadSessionCards, plannedSessionFor, sessionTitle } from './cards';
import { createSessionFromTemplate } from './sessionsRepo';

function session(id: string, extra: Partial<Session> = {}): Local<Session> {
  return {
    ...base(id),
    date: '2026-10-05',
    kind: 'strength',
    status: 'planned',
    template_id: null,
    was_planned: true,
    energy: null,
    notes: null,
    started_at: null,
    completed_at: null,
    ...extra,
  };
}

function child(id: string, sessionId: string, exerciseId: string, targetSets: number | null = 3): SessionExercise {
  return {
    ...base(id),
    session_id: sessionId,
    exercise_id: exerciseId,
    position: 0,
    notes: null,
    target_sets: targetSets,
    target_reps: 5,
    target_weight_kg: 100,
  };
}

function set(id: string, childId: string, extra: Partial<SetEntry> = {}): SetEntry {
  return {
    ...base(id),
    session_exercise_id: childId,
    set_index: 0,
    reps: 5,
    weight_kg: 100,
    rpe: 8,
    is_warmup: false,
    notes: null,
    ...extra,
  };
}

function exercise(id: string, name: string, modality: Exercise['modality'] = 'strength'): Exercise {
  return {
    ...base(id),
    name,
    muscle_group: null,
    modality,
    run_type: modality === 'cardio' ? 'easy' : null,
    default_sets: null,
    default_reps: null,
    default_weight_kg: null,
    default_duration_s: null,
    default_distance_km: null,
    sort_order: 0,
  };
}

describe('sessionTitle', () => {
  it('prefers the workout name', () => {
    expect(sessionTitle(session('s'), 'Push A', undefined)).toBe('Push A');
  });

  it('names a run by its run type', () => {
    expect(sessionTitle(session('s', { kind: 'run' }), undefined, 'Tempo Run')).toBe('Tempo Run');
    expect(sessionTitle(session('s', { kind: 'run' }), undefined, undefined)).toBe('Run');
  });

  it('marks an unplanned workout', () => {
    expect(sessionTitle(session('s', { was_planned: false }), undefined, undefined)).toBe('Unplanned workout');
  });
});

describe('buildCards', () => {
  const squat = exercise('e1', 'Squat');
  const easy = exercise('e2', 'Easy Run', 'cardio');

  it('counts working sets against targets, with volume and mean RPE', () => {
    const cards = buildCards({
      sessions: [session('s1')],
      children: [child('c1', 's1', 'e1', 3)],
      sets: [
        set('a', 'c1', { rpe: 7 }),
        set('b', 'c1', { rpe: 9 }),
        set('w', 'c1', { is_warmup: true, rpe: 4 }),
        set('x', 'c1', { deleted_at: '2026-10-05T07:00:00.000Z' }),
      ],
      runs: [],
      templates: [],
      exercises: [squat],
    });
    expect(cards[0]).toMatchObject({ workingSets: 2, targetSets: 3, volumeKg: 1000, avgRpe: 8 });
  });

  it('attaches the run and names the session after it', () => {
    const run: Local<Run> = {
      ...base('r1'),
      session_id: 's1',
      exercise_id: 'e2',
      run_type: 'easy',
      distance_km: 8,
      duration_s: 2700,
      rpe: 6,
      avg_hr: null,
      weather: null,
      route_note: null,
    };
    const [card] = buildCards({
      sessions: [session('s1', { kind: 'run' })],
      children: [],
      sets: [],
      runs: [run],
      templates: [],
      exercises: [easy],
    });
    expect(card.run?.id).toBe('r1');
    expect(card.title).toBe('Easy Run');
    expect(card.avgRpe).toBe(6);
  });

  it('leaves cardio exercises out of the set target', () => {
    const [card] = buildCards({
      sessions: [session('s1', { kind: 'mixed' })],
      children: [child('c1', 's1', 'e1', 3), child('c2', 's1', 'e2', null)],
      sets: [],
      runs: [],
      templates: [],
      exercises: [squat, easy],
    });
    expect(card.targetSets).toBe(3);
  });

  it('drops deleted sessions and orders by date', () => {
    const cards = buildCards({
      sessions: [
        session('late', { date: '2026-10-07' }),
        session('gone', { deleted_at: '2026-10-01T00:00:00.000Z' }),
        session('early', { date: '2026-10-05' }),
      ],
      children: [],
      sets: [],
      runs: [],
      templates: [],
      exercises: [],
    });
    expect(cards.map((c) => c.session.id)).toEqual(['early', 'late']);
  });
});

describe('loadSessionCards', () => {
  beforeEach(resetDb);

  it('loads the sessions in a date range', async () => {
    const squat = await makeExercise('Squat');
    const legs = await makeWorkout('Legs', [squat]);
    await createSessionFromTemplate('2026-10-05', legs.id, { wasPlanned: true });
    await createSessionFromTemplate('2026-10-12', legs.id, { wasPlanned: true });

    const cards = await loadSessionCards('2026-10-05', '2026-10-11');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ title: 'Legs', targetSets: 3, workingSets: 0 });
  });
});

describe('plannedSessionFor', () => {
  const sessions = [
    session('done-push', { template_id: 'push', status: 'done' }),
    session('planned-push', { template_id: 'push', status: 'planned' }),
    session('planned-empty', { template_id: null, status: 'planned' }),
  ];

  it("finds today's planned session for the chosen workout", () => {
    expect(plannedSessionFor(sessions, 'push')?.id).toBe('planned-push');
  });

  it('ignores a session for the same workout that is no longer planned', () => {
    expect(plannedSessionFor([sessions[0]], 'push')).toBeUndefined();
  });

  it('finds nothing for another workout', () => {
    expect(plannedSessionFor(sessions, 'pull')).toBeUndefined();
  });

  it('never reuses a session for an empty workout', () => {
    expect(plannedSessionFor(sessions, null)).toBeUndefined();
  });
});
