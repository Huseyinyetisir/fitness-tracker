import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { insertRow, softDeleteRow } from '../../db/repo';
import { isSystemTimestamp, systemISO } from '../../lib/time';
import { mergeRow } from '../../sync/merge';
import { USER, base, makeExercise, makeWorkout, markSynced, resetDb } from '../../test/fixtures';
import type { Local, Session, SessionExercise, SetEntry, WeekPlan, WorkoutTemplate } from '../../types/domain';
import { loadSessionView } from '../log/sessionView';
import { logSet } from '../log/setsRepo';
import {
  decide,
  desiredFor,
  desiredSignature,
  materializeWeek,
  plannedChildId,
  plannedSessionId,
  sessionKindFor,
  type DesiredSession,
} from './materialize';
import { defaultPlanDayId, ensureWeekPlan, setDayTemplate } from './planRepo';
import { listWorkoutItems, updateWorkoutItem } from './workoutsRepo';

const MON = '2026-10-05';
const WED = '2026-10-07';
const PREV_MON = '2026-09-28';

// ---------------------------------------------------------------- pure rules

describe('sessionKindFor', () => {
  it('is strength, run or mixed', () => {
    expect(sessionKindFor(['strength', 'strength'])).toBe('strength');
    expect(sessionKindFor(['cardio'])).toBe('run');
    expect(sessionKindFor(['strength', 'cardio'])).toBe('mixed');
    expect(sessionKindFor([])).toBe('strength');
  });
});

describe('desiredFor', () => {
  const plan: WeekPlan = { ...base('p'), name: 'Plan', active_from: MON };
  const days = [{ ...base('d1'), week_plan_id: 'p', weekday: 1 as const, template_id: 't1' }];
  const templates: WorkoutTemplate[] = [{ ...base('t1'), name: 'Legs', notes: null }];
  const items = [
    {
      ...base('i1'),
      template_id: 't1',
      exercise_id: 'e1',
      position: 0,
      target_sets: 3,
      target_reps: 5,
      target_weight_kg: 100,
      target_duration_s: null,
      target_distance_km: null,
      target_rpe: null,
      rest_seconds: null,
      notes: null,
    },
  ];
  const exercises = [
    {
      ...base('e1'),
      name: 'Squat',
      muscle_group: 'legs',
      modality: 'strength' as const,
      run_type: null,
      default_sets: 3,
      default_reps: 5,
      default_weight_kg: 100,
      default_duration_s: null,
      default_distance_km: null,
      sort_order: 1,
    },
  ];

  it('describes the workout planned for a weekday', () => {
    const d = desiredFor(MON, plan, days, templates, items, exercises);
    expect(d?.templateId).toBe('t1');
    expect(d?.kind).toBe('strength');
    expect(d?.items).toEqual([
      { itemId: 'i1', exerciseId: 'e1', position: 0, targetSets: 3, targetReps: 5, targetWeightKg: 100 },
    ]);
  });

  it('is null on a rest day', () => {
    expect(desiredFor(WED, plan, days, templates, items, exercises)).toBeNull();
  });

  it('is null before the plan starts', () => {
    expect(desiredFor(PREV_MON, plan, days, templates, items, exercises)).toBeNull();
  });

  it('is null when the assigned workout was deleted', () => {
    const gone = [{ ...templates[0], deleted_at: '2026-10-01T00:00:00.000Z' }];
    expect(desiredFor(MON, plan, days, gone, items, exercises)).toBeNull();
  });
});

describe('decide', () => {
  const desired: DesiredSession = {
    templateId: 't1',
    kind: 'strength',
    items: [{ itemId: 'i1', exerciseId: 'e1', position: 0, targetSets: 3, targetReps: 5, targetWeightKg: 100 }],
  };
  const SYSTEM = '1976-10-01T00:00:00.000Z';
  const REAL = '2026-10-01T00:00:00.000Z';
  function session(extra: Partial<Session> = {}): Session {
    return {
      ...base('s', { updated_at: SYSTEM }),
      date: WED,
      kind: 'strength',
      status: 'planned',
      template_id: 't1',
      was_planned: true,
      energy: null,
      notes: null,
      started_at: null,
      completed_at: null,
      ...extra,
    };
  }
  const args = (extra: Partial<Parameters<typeof decide>[0]>) => ({
    existing: session(),
    existingSignature: desiredSignature(desired),
    desired,
    date: WED,
    today: MON,
    hasLoggedWork: false,
    ...extra,
  });

  it('inserts a missing training day and leaves a missing rest day alone', () => {
    expect(decide(args({ existing: undefined }))).toBe('insert');
    expect(decide(args({ existing: undefined, desired: null }))).toBe('leave');
  });

  it('leaves an untouched row that already matches', () => {
    expect(decide(args({}))).toBe('leave');
  });

  it('rewrites an untouched future row when the workout changes', () => {
    expect(decide(args({ existing: session({ template_id: 't2' }) }))).toBe('rewrite');
  });

  it('rewrites an untouched future row when the workout was edited', () => {
    expect(decide(args({ existingSignature: 'something else' }))).toBe('rewrite');
  });

  it('removes an untouched future row when the day becomes rest', () => {
    expect(decide(args({ desired: null }))).toBe('remove');
  });

  it('revives a row the system removed when the day is planned again', () => {
    const tombstone = session({ deleted_at: SYSTEM });
    expect(decide(args({ existing: tombstone }))).toBe('revive');
    expect(decide(args({ existing: tombstone, desired: null }))).toBe('leave');
  });

  it('never touches a row the user edited, finished or logged into', () => {
    expect(decide(args({ existing: session({ template_id: 't2', updated_at: REAL }) }))).toBe('leave');
    expect(decide(args({ existing: session({ template_id: 't2', status: 'done' }) }))).toBe('leave');
    expect(decide(args({ existing: session({ template_id: 't2' }), hasLoggedWork: true }))).toBe('leave');
  });

  it('never recreates a row the user removed', () => {
    expect(decide(args({ existing: session({ deleted_at: REAL, updated_at: REAL }) }))).toBe('leave');
  });

  it('never rewrites the past', () => {
    expect(decide(args({ existing: session({ template_id: 't2' }), today: '2026-10-08' }))).toBe('leave');
  });
});

// ---------------------------------------------------------------- against the database

async function setup() {
  await markSynced();
  const squat = await makeExercise('Squat');
  const bench = await makeExercise('Bench');
  const run = await makeExercise('Easy Run', 'cardio');
  const legs = await makeWorkout('Legs', [squat]);
  const push = await makeWorkout('Push', [bench]);
  const easy = await makeWorkout('Easy run', [run]);
  const mixed = await makeWorkout('Brick', [squat, run]);
  await ensureWeekPlan(USER, MON);
  await setDayTemplate(defaultPlanDayId(USER, 1), legs.id);
  return { squat, bench, legs, push, easy, mixed };
}

async function week(start = MON) {
  const rows = await db.sessions.where('date').between(start, '2026-10-11', true, true).toArray();
  return rows.filter((s) => s._deleted === 0);
}

async function childrenOf(sessionId: string) {
  return (await db.session_exercises.where('session_id').equals(sessionId).toArray()).filter((c) => c._deleted === 0);
}

beforeEach(resetDb);

describe('materializeWeek', () => {
  it('does nothing before a plan exists', async () => {
    expect(await materializeWeek(USER, MON, MON)).toBe(0);
    expect(await db.sessions.count()).toBe(0);
  });

  it('creates a planned session on each training day and nothing on rest days', async () => {
    const { legs, squat } = await setup();
    await materializeWeek(USER, MON, MON);

    const sessions = await week();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ date: MON, status: 'planned', template_id: legs.id, was_planned: true, kind: 'strength' });
    const children = await childrenOf(sessions[0].id);
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({ exercise_id: squat.id, target_sets: 3, target_reps: 5, target_weight_kg: 100 });
  });

  it('gives every device the same id for a date, and stamps rows as system writes', async () => {
    await setup();
    await materializeWeek(USER, MON, MON);
    const [s] = await week();
    expect(s.id).toBe(plannedSessionId(USER, MON));
    expect(isSystemTimestamp(s.updated_at)).toBe(true);
    expect(isSystemTimestamp((await childrenOf(s.id))[0].updated_at)).toBe(true);
  });

  it('is idempotent', async () => {
    await setup();
    await materializeWeek(USER, MON, MON);
    const [before] = await week();
    expect(await materializeWeek(USER, MON, MON)).toBe(0);
    const [after] = await week();
    expect(after.updated_at).toBe(before.updated_at);
    expect(await db.sessions.count()).toBe(1);
  });

  it('is safe under concurrent calls', async () => {
    await setup();
    await Promise.all([materializeWeek(USER, MON, MON), materializeWeek(USER, MON, MON)]);
    expect(await db.sessions.count()).toBe(1);
    expect(await db.session_exercises.count()).toBe(1);
  });

  it('never recreates a session the user removed', async () => {
    await setup();
    await materializeWeek(USER, MON, MON);
    await softDeleteRow('sessions', plannedSessionId(USER, MON));
    await materializeWeek(USER, MON, MON);
    expect(await week()).toHaveLength(0);
  });

  it("rewrites an untouched future session when the day's workout changes", async () => {
    const { push, legs, squat } = await setup();
    await setDayTemplate(defaultPlanDayId(USER, 3), push.id);
    await materializeWeek(USER, MON, MON);
    await setDayTemplate(defaultPlanDayId(USER, 3), legs.id);
    await materializeWeek(USER, MON, MON);

    const wed = await db.sessions.get(plannedSessionId(USER, WED));
    expect(wed?.template_id).toBe(legs.id);
    expect((await childrenOf(wed!.id)).map((c) => c.exercise_id)).toEqual([squat.id]);
  });

  it('removes an untouched future session when the day becomes rest, and revives it when set back', async () => {
    const { push } = await setup();
    await setDayTemplate(defaultPlanDayId(USER, 3), push.id);
    await materializeWeek(USER, MON, MON);

    await setDayTemplate(defaultPlanDayId(USER, 3), null);
    await materializeWeek(USER, MON, MON);
    expect((await db.sessions.get(plannedSessionId(USER, WED)))?._deleted).toBe(1);

    await setDayTemplate(defaultPlanDayId(USER, 3), push.id);
    await materializeWeek(USER, MON, MON);
    const wed = await db.sessions.get(plannedSessionId(USER, WED));
    expect(wed?._deleted).toBe(0);
    expect(await childrenOf(wed!.id)).toHaveLength(1);
  });

  it('leaves past days as they were planned', async () => {
    const { legs, push } = await setup();
    await materializeWeek(USER, MON, MON);
    await setDayTemplate(defaultPlanDayId(USER, 1), push.id);
    await materializeWeek(USER, MON, WED);
    expect((await db.sessions.get(plannedSessionId(USER, MON)))?.template_id).toBe(legs.id);
  });

  it('leaves a session alone once work is logged into it', async () => {
    const { push, legs } = await setup();
    await setDayTemplate(defaultPlanDayId(USER, 3), push.id);
    await materializeWeek(USER, MON, MON);
    const [child] = await childrenOf(plannedSessionId(USER, WED));
    await insertRow<SetEntry>('set_entries', {
      session_exercise_id: child.id,
      set_index: 0,
      reps: 5,
      weight_kg: 80,
      rpe: 8,
      is_warmup: false,
      notes: null,
    });

    await setDayTemplate(defaultPlanDayId(USER, 3), legs.id);
    await materializeWeek(USER, MON, MON);
    expect((await db.sessions.get(plannedSessionId(USER, WED)))?.template_id).toBe(push.id);
  });

  it('carries workout edits into untouched future sessions', async () => {
    const { push } = await setup();
    await setDayTemplate(defaultPlanDayId(USER, 3), push.id);
    await materializeWeek(USER, MON, MON);
    const [item] = await listWorkoutItems(push.id);
    await updateWorkoutItem(item.id, { target_reps: 12 });
    await materializeWeek(USER, MON, MON);
    const [child] = await childrenOf(plannedSessionId(USER, WED));
    expect(child.target_reps).toBe(12);
  });

  it('derives the session kind from the workout', async () => {
    const { easy, mixed } = await setup();
    await setDayTemplate(defaultPlanDayId(USER, 2), easy.id);
    await setDayTemplate(defaultPlanDayId(USER, 4), mixed.id);
    await materializeWeek(USER, MON, MON);
    expect((await db.sessions.get(plannedSessionId(USER, '2026-10-06')))?.kind).toBe('run');
    expect((await db.sessions.get(plannedSessionId(USER, '2026-10-08')))?.kind).toBe('mixed');
  });

  it("skips dates before the plan's start", async () => {
    await setup();
    await materializeWeek(USER, PREV_MON, MON);
    expect(await db.sessions.count()).toBe(0);
  });

  it('leaves unplanned sessions on the same day alone', async () => {
    await setup();
    const extra = await insertRow<Session>('sessions', {
      date: MON,
      kind: 'run',
      status: 'done',
      template_id: null,
      was_planned: false,
      energy: null,
      notes: null,
      started_at: null,
      completed_at: null,
    });
    await materializeWeek(USER, MON, MON);
    const sessions: Local<Session>[] = await week();
    expect(sessions.map((s) => s.id).sort()).toEqual([extra.id, plannedSessionId(USER, MON)].sort());
  });
});

// ---------------------------------------------------------------- another device's rewrite, arriving by pull

/** Applies a remote session_exercises row exactly as pullTable does. */
async function pullChild(remote: SessionExercise) {
  const merged = mergeRow(await db.session_exercises.get(remote.id), remote);
  if (merged) await db.session_exercises.put(merged);
}

/** The server's copy of a local row: no local index fields. */
function asRemote(row: Local<SessionExercise>, patch: Partial<SessionExercise>): SessionExercise {
  const { _dirty, _deleted, ...rest } = row;
  void _dirty;
  void _deleted;
  return { ...rest, ...patch };
}

describe('a session the user logged into, rewritten from the plan by another device', () => {
  it('keeps the logged exercise and its sets, and drops the exercise the other device injected', async () => {
    const { squat, bench, push } = await setup();
    await materializeWeek(USER, MON, MON);
    const sessionId = plannedSessionId(USER, MON);
    const [squatChild] = await childrenOf(sessionId);
    expect(squatChild.exercise_id).toBe(squat.id);

    // The phone, offline in the gym, logs Squat.
    const set = await logSet(squatChild.id, { reps: 5, weight_kg: 100, rpe: 8, is_warmup: false });

    // The laptop, which never saw that, changed Monday to Push and rewrote the
    // session from the plan. The server rejected the session row (the phone's
    // claim is newer) but took both exercise writes; the phone now pulls them.
    const [pushItem] = await listWorkoutItems(push.id);
    await pullChild(asRemote(squatChild, { deleted_at: new Date().toISOString(), updated_at: systemISO() }));
    const benchId = plannedChildId(sessionId, pushItem.id);
    const benchRow: Local<SessionExercise> = {
      ...base(benchId, { updated_at: systemISO() }),
      session_id: sessionId,
      exercise_id: bench.id,
      position: 0,
      notes: null,
      target_sets: 3,
      target_reps: 5,
      target_weight_kg: 100,
    };
    await pullChild(asRemote(benchRow, {}));

    await materializeWeek(USER, MON, MON);

    expect((await db.session_exercises.get(squatChild.id))?._deleted).toBe(0);
    expect((await db.set_entries.get(set.id))?._deleted).toBe(0);
    const view = await loadSessionView(sessionId);
    expect(view?.blocks.map((b) => b.child.id)).toEqual([squatChild.id]);
    expect(view?.blocks[0].sets.map((s) => s.id)).toEqual([set.id]);
    const injected = await db.session_exercises.get(benchId);
    expect(injected?._deleted).toBe(1);
    expect(injected?._dirty).toBe(1);
  });

  it('never deletes a system-stamped exercise that has a live set, even under a session the user owns', async () => {
    const { bench } = await setup();
    await materializeWeek(USER, MON, MON);
    const sessionId = plannedSessionId(USER, MON);
    const [squatChild] = await childrenOf(sessionId);

    // Data as an older build left it: work logged, the exercise never claimed.
    const set = await insertRow<SetEntry>('set_entries', {
      session_exercise_id: squatChild.id,
      set_index: 0,
      reps: 5,
      weight_kg: 100,
      rpe: 8,
      is_warmup: false,
      notes: null,
    });
    // And an exercise injected by another device's plan rewrite, with nothing logged.
    const injected = await insertRow<SessionExercise>(
      'session_exercises',
      {
        session_id: sessionId,
        exercise_id: bench.id,
        position: 1,
        notes: null,
        target_sets: 3,
        target_reps: 5,
        target_weight_kg: 100,
      },
      { system: true },
    );
    expect(isSystemTimestamp((await db.session_exercises.get(squatChild.id))!.updated_at)).toBe(true);

    expect(await materializeWeek(USER, MON, MON)).toBe(1);

    expect((await db.session_exercises.get(squatChild.id))?._deleted).toBe(0);
    expect((await db.set_entries.get(set.id))?._deleted).toBe(0);
    expect((await db.session_exercises.get(injected.id))?._deleted).toBe(1);
    expect(await materializeWeek(USER, MON, MON)).toBe(0);
  });
});
