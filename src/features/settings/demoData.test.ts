import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { seedExercises } from '../../db/seed';
import { markSynced, resetDb } from '../../test/fixtures';
import { createSessionFromTemplate } from '../log/sessionsRepo';
import { duplicateWorkout } from '../plan/workoutsRepo';
import { loadProgressData } from '../progress/progressData';
import { fatigueAlerts } from '../progress/rpeStats';
import { adherenceInRange } from '../progress/strengthStats';
import { buildDemo, DEMO_NOTE, hasDemoData, loadDemoData, removeDemoData } from './demoData';

const TODAY = '2026-10-04';

describe('buildDemo', () => {
  it('is the same every time', () => {
    expect(buildDemo(TODAY)).toEqual(buildDemo(TODAY));
  });

  it('covers twelve weeks before this one and stops before today', () => {
    const { sessions, body } = buildDemo(TODAY);
    const dates = sessions.map((s) => s.date).sort();
    expect(dates[0]).toBe('2026-07-06');
    expect(dates.at(-1)).toBe('2026-10-03');
    expect(body).toHaveLength(13);
  });

  it('plans strength on Monday, Wednesday and Friday and runs on Tuesday, Thursday and Saturday', () => {
    const week = buildDemo(TODAY).sessions.filter((s) => s.date >= '2026-07-06' && s.date <= '2026-07-12');
    expect(week.map((s) => [s.date, s.workout ?? 'run'])).toEqual([
      ['2026-07-06', 'A'],
      ['2026-07-07', 'run'],
      ['2026-07-08', 'B'],
      ['2026-07-09', 'run'],
      ['2026-07-10', 'A'],
      ['2026-07-11', 'run'],
    ]);
  });

  it('uses only valid RPE values', () => {
    const rpes = buildDemo(TODAY).sessions.flatMap((s) => [
      ...s.lifts.flatMap((l) => l.sets.map((set) => set.rpe)),
      ...(s.run ? [s.run.rpe] : []),
    ]);
    expect(rpes.every((r) => r >= 1 && r <= 10 && Number.isInteger(r * 2))).toBe(true);
  });
});

describe('loading and removing demo data', () => {
  beforeEach(async () => {
    await resetDb();
    await markSynced();
    await seedExercises();
  });

  it('writes sessions, sets, runs, workouts and body entries, all marked', async () => {
    const written = await loadDemoData(TODAY);
    expect(written).toBeGreaterThan(500);
    expect(await hasDemoData()).toBe(true);

    const sessions = await db.sessions.toArray();
    expect(sessions.every((s) => s.notes === DEMO_NOTE && s._dirty === 1)).toBe(true);
    expect(await db.runs.count()).toBeGreaterThan(30);
    expect((await db.body_metrics.toArray()).every((b) => b.note === DEMO_NOTE)).toBe(true);
    expect((await db.workout_templates.toArray()).map((t) => t.name).sort()).toEqual([
      'Demo — Deadlift & Press',
      'Demo — Squat & Bench',
    ]);
  });

  it('gives the charts something to show, including a fatigue alert', async () => {
    await loadDemoData(TODAY);
    const data = await loadProgressData(TODAY);
    expect(fatigueAlerts(data.lifts, data.exercises, TODAY).map((a) => a.name)).toContain('Barbell Bench Press');
    const result = adherenceInRange(data.sessions, '2026-07-06', TODAY);
    expect(result.pct).toBeGreaterThan(70);
    expect(result.pct).toBeLessThan(100);
  });

  it('refuses to load twice', async () => {
    await loadDemoData(TODAY);
    await expect(loadDemoData(TODAY)).rejects.toThrow('already loaded');
  });

  it('needs the exercise library', async () => {
    await db.exercises.clear();
    await expect(loadDemoData(TODAY)).rejects.toThrow('library is empty');
  });

  it('removes every demo row and leaves real data alone', async () => {
    const real = await createSessionFromTemplate('2026-10-02', null, { wasPlanned: false });
    await loadDemoData(TODAY);
    const removed = await removeDemoData();

    expect(removed).toBeGreaterThan(60);
    expect(await hasDemoData()).toBe(false);
    const live = await db.sessions.where('_deleted').equals(0).toArray();
    expect(live.map((s) => s.id)).toEqual([real.id]);
    expect(await db.set_entries.where('_deleted').equals(0).count()).toBe(0);
    expect(await db.runs.where('_deleted').equals(0).count()).toBe(0);
    expect(await db.body_metrics.where('_deleted').equals(0).count()).toBe(0);
    expect(await db.workout_templates.where('_deleted').equals(0).count()).toBe(0);
  });

  it("keeps the user's copy of a demo workout", async () => {
    await loadDemoData(TODAY);
    const demo = (await db.workout_templates.toArray()).find((t) => t.name === 'Demo — Squat & Bench')!;
    const copy = await duplicateWorkout(demo.id);

    await removeDemoData();

    expect((await db.workout_templates.get(copy.id))?.deleted_at).toBeNull();
    expect(await db.workout_template_items.where('template_id').equals(copy.id).filter((i) => !i.deleted_at).count()).toBe(3);
  });
});
