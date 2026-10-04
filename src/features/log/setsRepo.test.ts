import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { insertRow } from '../../db/repo';
import { isSystemTimestamp } from '../../lib/time';
import { USER, makeExercise, makeWorkout, markSynced, resetDb } from '../../test/fixtures';
import type { Session } from '../../types/domain';
import { materializeWeek, plannedSessionId } from '../plan/materialize';
import { defaultPlanDayId, ensureWeekPlan, setDayTemplate } from '../plan/planRepo';
import { createSessionFromTemplate } from './sessionsRepo';
import {
  addExerciseToSession,
  deleteSet,
  finishSession,
  logSet,
  removeExerciseFromSession,
  setExerciseNote,
  updateSet,
} from './setsRepo';

const MON = '2026-10-05';
const SET = { reps: 5, weight_kg: 100, rpe: 8, is_warmup: false };

beforeEach(resetDb);

async function legsSession() {
  const squat = await makeExercise('Squat');
  const legs = await makeWorkout('Legs', [squat]);
  const session = await createSessionFromTemplate(MON, legs.id, { wasPlanned: true });
  const [child] = await db.session_exercises.where('session_id').equals(session.id).toArray();
  return { squat, session, child };
}

/** Monday materialized from the plan as Legs (Squat, Lunge): system-stamped, untouched. */
async function materializedLegs() {
  await markSynced();
  const squat = await makeExercise('Squat');
  const lunge = await makeExercise('Lunge');
  const legs = await makeWorkout('Legs', [squat, lunge]);
  await ensureWeekPlan(USER, MON);
  await setDayTemplate(defaultPlanDayId(USER, 1), legs.id);
  await materializeWeek(USER, MON, MON);
  const sessionId = plannedSessionId(USER, MON);
  const children = (await db.session_exercises.where('session_id').equals(sessionId).toArray())
    .filter((c) => c._deleted === 0)
    .sort((a, b) => a.position - b.position);
  expect(children).toHaveLength(2);
  expect(isSystemTimestamp((await db.sessions.get(sessionId))!.updated_at)).toBe(true);
  expect(children.every((c) => isSystemTimestamp(c.updated_at))).toBe(true);
  return { sessionId, children };
}

async function liveChildStamps(sessionId: string) {
  return (await db.session_exercises.where('session_id').equals(sessionId).toArray())
    .filter((c) => c._deleted === 0)
    .map((c) => isSystemTimestamp(c.updated_at));
}

async function setsOf(childId: string) {
  return (await db.set_entries.where('session_exercise_id').equals(childId).toArray()).filter((s) => s._deleted === 0);
}

describe('logSet', () => {
  it('refuses a set without an RPE and writes nothing', async () => {
    const { child } = await legsSession();
    await expect(logSet(child.id, { ...SET, rpe: null })).rejects.toThrow(/RPE/);
    expect(await db.set_entries.count()).toBe(0);
  });

  it('numbers sets in order and never reuses a deleted index', async () => {
    const { child } = await legsSession();
    const a = await logSet(child.id, SET);
    const b = await logSet(child.id, SET);
    await deleteSet(b.id);
    const c = await logSet(child.id, SET);
    expect([a.set_index, b.set_index, c.set_index]).toEqual([0, 1, 2]);
  });

  it('marks the session started the first time', async () => {
    const { session, child } = await legsSession();
    await logSet(child.id, SET);
    expect((await db.sessions.get(session.id))?.started_at).not.toBeNull();
  });

  it('claims a materialized session so the plan never rewrites it', async () => {
    const squat = await makeExercise('Squat');
    const planned = await insertRow<Session>(
      'sessions',
      {
        date: MON,
        kind: 'strength',
        status: 'planned',
        template_id: null,
        was_planned: true,
        energy: null,
        notes: null,
        started_at: null,
        completed_at: null,
      },
      { system: true },
    );
    const child = await addExerciseToSession(planned.id, squat);
    expect(isSystemTimestamp((await db.sessions.get(planned.id))!.updated_at)).toBe(false);
    await logSet(child.id, SET);
    expect(isSystemTimestamp((await db.sessions.get(planned.id))!.updated_at)).toBe(false);
  });

  it("claims every live exercise of a materialized session, not just the one logged into", async () => {
    const { sessionId, children } = await materializedLegs();
    await logSet(children[0].id, SET);
    expect(isSystemTimestamp((await db.sessions.get(sessionId))!.updated_at)).toBe(false);
    expect(await liveChildStamps(sessionId)).toEqual([false, false]);
  });
});

describe('editing sets', () => {
  it('updates a set, validating it first', async () => {
    const { child } = await legsSession();
    const s = await logSet(child.id, SET);
    await expect(updateSet(s.id, { ...SET, reps: 0 })).rejects.toThrow(/Reps/);
    await updateSet(s.id, { ...SET, reps: 6, rpe: 9 });
    expect(await db.set_entries.get(s.id)).toMatchObject({ reps: 6, rpe: 9 });
  });

  it('soft-deletes a set', async () => {
    const { child } = await legsSession();
    const s = await logSet(child.id, SET);
    await deleteSet(s.id);
    expect(await setsOf(child.id)).toEqual([]);
  });
});

describe('exercises within a session', () => {
  it('appends an exercise with its defaults as targets', async () => {
    const { session } = await legsSession();
    const lunge = await makeExercise('Lunge');
    const added = await addExerciseToSession(session.id, lunge);
    expect(added).toMatchObject({ position: 1, exercise_id: lunge.id, target_sets: 3, target_reps: 5 });
  });

  it('removes an exercise together with its sets', async () => {
    const { child } = await legsSession();
    await logSet(child.id, SET);
    await removeExerciseFromSession(child.id);
    expect((await db.session_exercises.get(child.id))?._deleted).toBe(1);
    expect(await setsOf(child.id)).toEqual([]);
  });

  it('stores a trimmed note, or none', async () => {
    const { child } = await legsSession();
    await setExerciseNote(child.id, '  knee felt fine  ');
    expect((await db.session_exercises.get(child.id))?.notes).toBe('knee felt fine');
    await setExerciseNote(child.id, '   ');
    expect((await db.session_exercises.get(child.id))?.notes).toBeNull();
  });
});

describe('finishSession', () => {
  it('records status, energy, notes and completion', async () => {
    const { session } = await legsSession();
    await finishSession(session.id, { status: 'partial', energy: 4, notes: 'short on time' });
    const stored = await db.sessions.get(session.id);
    expect(stored).toMatchObject({ status: 'partial', energy: 4, notes: 'short on time' });
    expect(stored?.completed_at).not.toBeNull();
    expect(stored?.started_at).not.toBeNull();
  });

  it('claims an untouched materialized session and its exercises, e.g. when skipping it', async () => {
    const { sessionId } = await materializedLegs();
    await finishSession(sessionId, { status: 'skipped', energy: null, notes: null });
    const stored = await db.sessions.get(sessionId);
    expect(stored?.status).toBe('skipped');
    expect(isSystemTimestamp(stored!.updated_at)).toBe(false);
    expect(await liveChildStamps(sessionId)).toEqual([false, false]);
  });

  it('keeps an existing start time', async () => {
    const { session, child } = await legsSession();
    await logSet(child.id, SET);
    const started = (await db.sessions.get(session.id))?.started_at;
    await finishSession(session.id, { status: 'done', energy: null, notes: null });
    expect((await db.sessions.get(session.id))?.started_at).toBe(started);
  });
});
