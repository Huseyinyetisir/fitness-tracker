import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { softDeleteRow } from '../../db/repo';
import { db } from '../../db/schema';
import { SEED_EXERCISES, seedExercises } from '../../db/seed';
import { SYNCED_TABLES } from '../../sync/tables';
import { clearLocalData } from '../../sync/wipe';
import { base, makeExercise, makeWorkout, markSynced, resetDb } from '../../test/fixtures';
import { sessionRow } from '../../test/rows';
import type { Local, Session } from '../../types/domain';
import { createSessionFromTemplate } from '../log/sessionsRepo';
import { logSet, setExerciseNote } from '../log/setsRepo';
import { materializeWeek, plannedSessionId } from '../plan/materialize';
import { defaultPlanDayId, defaultPlanId, ensureWeekPlan, setDayTemplate } from '../plan/planRepo';
import { buildBackup, type Backup } from './backup';
import { ensurePrefs, prefsId, updatePrefs } from './prefsRepo';
import { forAccount, importBackup, mergeImported } from './restore';

const TODAY = '2026-10-04';
const OLD = 'old-account';
const NEW = 'new-account';

describe('mergeImported', () => {
  const local = sessionRow('s', { updated_at: '2026-10-02T06:00:00.000Z', _dirty: 0 } as Partial<Session>);

  it('adds a row this device does not have, queued for push', () => {
    expect(mergeImported(undefined, sessionRow('s'))).toMatchObject({ id: 's', _dirty: 1, _deleted: 0 });
  });

  it('takes a newer imported row, queued for push', () => {
    const imported = sessionRow('s', { updated_at: '2026-10-03T06:00:00.000Z', notes: 'newer' });
    expect(mergeImported(local, imported)).toMatchObject({ notes: 'newer', _dirty: 1 });
  });

  it('keeps the local row when it is newer or the same version', () => {
    expect(mergeImported(local, sessionRow('s', { updated_at: '2026-10-01T06:00:00.000Z' }))).toBeNull();
    expect(mergeImported(local, sessionRow('s', { updated_at: '2026-10-02T06:00:00+00:00' }))).toBeNull();
  });

  it('carries a tombstone', () => {
    const gone = sessionRow('s', { updated_at: '2026-10-03T06:00:00.000Z', deleted_at: '2026-10-03T06:00:00.000Z' });
    expect(mergeImported(local, gone)).toMatchObject({ _deleted: 1, _dirty: 1 });
  });
});

describe('importBackup', () => {
  beforeEach(resetDb);

  it('adds, updates and leaves rows by last-write-wins, and reports the counts', async () => {
    await db.sessions.bulkPut([
      sessionRow('edited-here', { updated_at: '2026-10-03T06:00:00.000Z', notes: 'mine' }),
      sessionRow('older-here', { updated_at: '2026-10-01T06:00:00.000Z' }),
    ]);
    const backup = await buildBackup(OLD);
    backup.tables.sessions = [
      { ...sessionRow('edited-here', { updated_at: '2026-10-02T06:00:00.000Z', notes: 'stale' }) },
      { ...sessionRow('older-here', { updated_at: '2026-10-02T06:00:00.000Z', notes: 'from backup' }) },
      { ...sessionRow('new-row') },
    ];

    expect(await importBackup(backup)).toEqual({ added: 1, updated: 1, unchanged: 1 });
    expect((await db.sessions.get('edited-here'))?.notes).toBe('mine');
    expect(await db.sessions.get('older-here')).toMatchObject({ notes: 'from backup', _dirty: 1 });
    expect(await db.sessions.get('new-row')).toMatchObject({ _dirty: 1 });
  });

  it('is idempotent', async () => {
    const backup = await buildBackup(OLD);
    backup.tables.body_metrics = [{ ...base('b1'), date: '2026-10-01', weight_kg: 80, resting_hr: null, note: null } as never];
    await importBackup(backup);
    expect(await importBackup(backup)).toEqual({ added: 0, updated: 0, unchanged: 1 });
  });

  it('keeps an exercise deleted and re-created since the backup, when the deletion wins the merge', async () => {
    const old = await makeExercise('Hip Thrust');
    const backup = await buildBackup(OLD);
    await softDeleteRow('exercises', old.id);
    const fresh = await makeExercise('Hip Thrust');

    await importBackup(backup);

    expect((await db.exercises.get(old.id))?.deleted_at).not.toBeNull();
    const live = (await db.exercises.where('_deleted').equals(0).toArray()).filter((e) => e.name === 'Hip Thrust');
    expect(live.map((e) => e.id)).toEqual([fresh.id]);
  });
});

describe('importing your own backup after deleting everything', () => {
  let backup: Backup;

  beforeEach(async () => {
    await resetDb();
    await markSynced();
    await seedExercises();
    backup = await buildBackup(OLD);
    // Delete all, then the first sync seeds a fresh library with new ids.
    await clearLocalData();
    await markSynced();
    await seedExercises();
  });

  it("keeps the backup's library and retires the fresh copy, so nothing is doubled", async () => {
    await importBackup(backup);

    const live = await db.exercises.where('_deleted').equals(0).toArray();
    expect(live).toHaveLength(SEED_EXERCISES.length);
    const backupIds = new Set(backup.tables.exercises.map((e) => e.id));
    expect(live.every((e) => backupIds.has(e.id))).toBe(true);
    // Retired with a tombstone, so the server copy goes too.
    expect(await db.exercises.where('_deleted').equals(1).count()).toBe(SEED_EXERCISES.length);
    expect((await db.exercises.where('_deleted').equals(1).first())?._dirty).toBe(1);
  });

  it('keeps a fresh exercise that something here already uses, even with the same name', async () => {
    const squat = (await db.exercises.toArray()).find((e) => e.name === 'Back Squat')!;
    await makeWorkout('Legs', [squat]);

    await importBackup(backup);

    expect((await db.exercises.get(squat.id))?.deleted_at).toBeNull();
    expect(await db.exercises.where('_deleted').equals(0).count()).toBe(SEED_EXERCISES.length + 1);
  });
});

describe('restoring into another account', () => {
  let backup: Backup;
  let pastSessionId: string;
  let ownedFutureId: string;

  beforeEach(async () => {
    // The old account: library, a plan with Monday workouts, edited preferences,
    // a logged past session, next week materialized, one future day claimed.
    await resetDb();
    await markSynced();
    await seedExercises();
    await ensureWeekPlan(OLD, '2026-09-01');
    await ensurePrefs(OLD);
    await updatePrefs(OLD, { rest_seconds_default: 90 });
    const squat = await makeExercise('Squat');
    const legs = await makeWorkout('Legs', [squat]);
    await setDayTemplate(defaultPlanDayId(OLD, 1), legs.id);

    const past = await createSessionFromTemplate('2026-09-28', legs.id, { wasPlanned: true });
    const [child] = await db.session_exercises.where('session_id').equals(past.id).toArray();
    await logSet(child.id, { reps: 5, weight_kg: 100, rpe: 8, is_warmup: false });
    pastSessionId = past.id;

    await materializeWeek(OLD, '2026-10-05', TODAY);
    await materializeWeek(OLD, '2026-10-12', TODAY);
    ownedFutureId = plannedSessionId(OLD, '2026-10-12');
    const [futureChild] = await db.session_exercises.where('session_id').equals(ownedFutureId).toArray();
    await setExerciseNote(futureChild.id, 'go heavy');

    backup = await buildBackup(OLD);

    // The new account, after "Delete all": an empty device that has synced once.
    await resetDb();
    await markSynced();
    await importBackup(forAccount(backup, NEW, TODAY));
  });

  it("gives derived rows this account's ids, so setup creates no second copy", async () => {
    expect(await db.user_prefs.get(prefsId(NEW))).toMatchObject({ rest_seconds_default: 90 });
    expect(await db.week_plans.get(defaultPlanId(NEW))).toBeDefined();
    expect(await db.week_plan_days.get(defaultPlanDayId(NEW, 1))).toBeDefined();

    expect(await seedExercises()).toBe(0);
    expect((await ensureWeekPlan(NEW, TODAY))?.created).toBe(false);
    expect((await ensurePrefs(NEW))?.created).toBe(false);
  });

  it('reuses no id from the old account', async () => {
    const oldIds = new Set(SYNCED_TABLES.flatMap((name) => backup.tables[name].map((r) => r.id)));
    for (const name of SYNCED_TABLES) {
      const rows = await (db[name] as unknown as import('dexie').Table<{ id: string }, string>).toArray();
      expect(rows.filter((r) => oldIds.has(r.id))).toEqual([]);
    }
  });

  it('keeps every reference pointing at a restored row', async () => {
    const ids = async (name: (typeof SYNCED_TABLES)[number]) =>
      new Set((await (db[name] as unknown as import('dexie').Table<{ id: string }, string>).toArray()).map((r) => r.id));
    const [sessions, children, templates, exercises, plans] = await Promise.all([
      ids('sessions'),
      ids('session_exercises'),
      ids('workout_templates'),
      ids('exercises'),
      ids('week_plans'),
    ]);
    for (const c of await db.session_exercises.toArray()) {
      expect(sessions.has(c.session_id)).toBe(true);
      expect(exercises.has(c.exercise_id)).toBe(true);
    }
    for (const s of await db.set_entries.toArray()) expect(children.has(s.session_exercise_id)).toBe(true);
    for (const i of await db.workout_template_items.toArray()) expect(templates.has(i.template_id)).toBe(true);
    for (const d of await db.week_plan_days.toArray()) {
      expect(plans.has(d.week_plan_id)).toBe(true);
      if (d.template_id) expect(templates.has(d.template_id)).toBe(true);
    }
  });

  it('keeps logged history with its sets, queued for push', async () => {
    const past = (await db.sessions.toArray()).filter((s) => s.date === '2026-09-28');
    expect(past).toHaveLength(1);
    expect(past[0].id).not.toBe(pastSessionId);
    expect(past[0]._dirty).toBe(1);
    expect(await db.set_entries.count()).toBe(1);
  });

  it('drops untouched future plans and lets this account materialize them, with no duplicates', async () => {
    expect(await db.sessions.get(plannedSessionId(NEW, '2026-10-05'))).toBeUndefined();
    expect(await db.sessions.get(plannedSessionId(NEW, '2026-10-12'))).toMatchObject({ date: '2026-10-12' });

    await materializeWeek(NEW, '2026-10-05', TODAY);
    await materializeWeek(NEW, '2026-10-12', TODAY);
    const live = (await db.sessions.toArray()).filter((s: Local<Session>) => s._deleted === 0 && s.date >= TODAY);
    expect(live.map((s) => s.date).sort()).toEqual(['2026-10-05', '2026-10-12']);
    expect(await db.sessions.get(plannedSessionId(NEW, '2026-10-05'))).toBeDefined();
    expect(ownedFutureId).toBe(plannedSessionId(OLD, '2026-10-12'));
  });

  it('clears ownership and sync state from every row', async () => {
    const sessions = await db.sessions.toArray();
    expect(sessions.every((s) => s.user_id === null && s.server_updated_at === null)).toBe(true);
  });
});
