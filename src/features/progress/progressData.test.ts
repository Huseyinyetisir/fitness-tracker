import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { resetDb } from '../../test/fixtures';
import { bodyRow, childRow, exerciseRow, runRow, sessionRow, setRow } from '../../test/rows';
import { buildProgressData, loadProgressData } from './progressData';

const TODAY = '2026-10-04';

function raw() {
  return {
    sessions: [
      sessionRow('s1', { date: '2026-09-28' }),
      sessionRow('s2', { date: '2026-09-21', kind: 'run' }),
      sessionRow('gone', { date: '2026-09-14', deleted_at: '2026-09-15T06:00:00.000Z' }),
      sessionRow('later', { date: '2026-10-12', status: 'planned' }),
    ],
    children: [
      childRow('c1', 's1', 'squat'),
      childRow('c-gone', 's1', 'bench', { deleted_at: '2026-09-28T07:00:00.000Z' }),
      childRow('c-orphan', 'gone', 'squat'),
    ],
    sets: [
      setRow('a', 'c1', { set_index: 1, weight_kg: 105 }),
      setRow('b', 'c1', { set_index: 0, weight_kg: 100 }),
      setRow('warm', 'c1', { is_warmup: true, weight_kg: 60 }),
      setRow('deleted', 'c1', { deleted_at: '2026-09-28T07:00:00.000Z' }),
      setRow('under-gone-child', 'c-gone'),
      setRow('under-gone-session', 'c-orphan'),
    ],
    runs: [runRow('r1', 's2'), runRow('r-gone', 'gone')],
    exercises: [exerciseRow('squat', 'Back Squat')],
    body: [bodyRow('b2', '2026-09-20', { weight_kg: 81 }), bodyRow('b1', '2026-09-10', { weight_kg: 82 }), bodyRow('b-gone', '2026-09-01', { deleted_at: '2026-09-02T06:00:00.000Z' })],
  };
}

describe('buildProgressData', () => {
  it('keeps only live working sets under live exercises of live sessions, with their date', () => {
    const data = buildProgressData(raw(), TODAY);
    expect(data.lifts.map((l) => l.set_id)).toEqual(['b', 'a']);
    expect(data.lifts[0]).toMatchObject({ date: '2026-09-28', session_id: 's1', exercise_id: 'squat', weight_kg: 100 });
  });

  it('keeps only runs of live sessions, dated', () => {
    const data = buildProgressData(raw(), TODAY);
    expect(data.runs.map((r) => [r.run_id, r.date])).toEqual([['r1', '2026-09-21']]);
  });

  it('keeps live sessions and body entries in date order', () => {
    const data = buildProgressData(raw(), TODAY);
    expect(data.sessions.map((s) => s.id)).toEqual(['s2', 's1', 'later']);
    expect(data.body.map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('finds the earliest date with anything to show, ignoring the future', () => {
    expect(buildProgressData(raw(), TODAY).earliest).toBe('2026-09-10');
  });

  it('has no earliest date with no data', () => {
    expect(
      buildProgressData({ sessions: [], children: [], sets: [], runs: [], exercises: [], body: [] }, TODAY).earliest,
    ).toBeNull();
  });
});

describe('loadProgressData', () => {
  beforeEach(resetDb);

  it('reads every table it needs from Dexie', async () => {
    const r = raw();
    await db.sessions.bulkPut(r.sessions);
    await db.session_exercises.bulkPut(r.children);
    await db.set_entries.bulkPut(r.sets);
    await db.runs.bulkPut(r.runs);
    await db.exercises.bulkPut(r.exercises);
    await db.body_metrics.bulkPut(r.body);

    const data = await loadProgressData(TODAY);
    expect(data.lifts).toHaveLength(2);
    expect(data.runs).toHaveLength(1);
    expect(data.body).toHaveLength(2);
    expect(data.exercises.map((e) => e.name)).toEqual(['Back Squat']);
  });
});
