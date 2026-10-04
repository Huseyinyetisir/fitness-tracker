import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { base, resetDb } from '../../test/fixtures';
import { bodyRow, childRow, exerciseRow, runRow, sessionRow, setRow } from '../../test/rows';
import type { WorkoutTemplate } from '../../types/domain';
import { bodyCsv, csvFileName, loadCsvSources, runsCsv, setsCsv, toCsv, type CsvSources } from './csv';

const lines = (csv: string) => csv.replace(/^﻿/, '').split('\r\n').filter(Boolean);

describe('toCsv', () => {
  it('starts with a byte order mark and ends lines with CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('﻿a,b\r\n1,x\r\n');
  });

  it('quotes fields with commas, quotes or line breaks, and leaves nulls empty', () => {
    expect(toCsv(['note'], [['felt "easy", fast'], ['two\nlines'], [null]])).toBe(
      '\uFEFFnote\r\n"felt ""easy"", fast"\r\n"two\nlines"\r\n\r\n',
    );
  });
});

function sources(): CsvSources {
  const template: WorkoutTemplate = { ...base('t1'), name: 'Legs', notes: null };
  return {
    sessions: [
      sessionRow('s2', { date: '2026-10-02', template_id: 't1' }),
      sessionRow('s1', { date: '2026-09-28', status: 'partial', was_planned: false }),
      sessionRow('gone', { date: '2026-09-29', deleted_at: '2026-09-29T08:00:00.000Z' }),
      sessionRow('r', { date: '2026-09-30', kind: 'run' }),
    ],
    children: [childRow('c2', 's2', 'squat'), childRow('c1', 's1', 'bench'), childRow('cg', 'gone', 'squat')],
    sets: [
      setRow('b', 'c2', { set_index: 1, weight_kg: 102.5, rpe: 8.5 }),
      setRow('a', 'c2', { set_index: 0, weight_kg: 60, reps: 8, is_warmup: true }),
      setRow('x', 'c1', { notes: 'grip, slipped' }),
      setRow('d', 'c2', { set_index: 2, deleted_at: '2026-10-02T08:00:00.000Z' }),
      setRow('g', 'cg'),
    ],
    runs: [runRow('run', 'r', { exercise_id: 'easy', distance_km: 8, duration_s: 2880, avg_hr: 142 })],
    exercises: [exerciseRow('squat', 'Back Squat'), exerciseRow('bench', 'Bench Press'), exerciseRow('easy', 'Easy Run')],
    templates: [template],
    body: [bodyRow('b2', '2026-10-02', { weight_kg: 80.4 }), bodyRow('b1', '2026-09-27', { resting_hr: 55, note: 'rested' })],
  };
}

describe('setsCsv', () => {
  it('writes one row per live set, oldest first, with names, numbering and e1RM', () => {
    expect(lines(setsCsv(sources()))).toEqual([
      'date,workout,status,exercise,set,reps,weight_kg,rpe,warmup,e1rm_kg,note',
      '2026-09-28,Unplanned workout,partial,Bench Press,1,5,100,8,false,116.7,"grip, slipped"',
      '2026-10-02,Legs,done,Back Squat,1,8,60,8,true,,',
      '2026-10-02,Legs,done,Back Squat,2,5,102.5,8.5,false,119.6,',
    ]);
  });
});

describe('runsCsv and bodyCsv', () => {
  it('writes runs with duration and pace', () => {
    expect(lines(runsCsv(sources()))).toEqual([
      'date,run,run_type,status,distance_km,duration,duration_s,pace_per_km,rpe,avg_hr,weather,route_note',
      '2026-09-30,Easy Run,easy,done,8,48:00,2880,6:00,6,142,,',
    ]);
  });

  it('writes body entries oldest first', () => {
    expect(lines(bodyCsv(sources()))).toEqual(['date,weight_kg,resting_hr,note', '2026-09-27,,55,rested', '2026-10-02,80.4,,']);
  });

  it('names files by kind and date', () => {
    expect(csvFileName('sets', '2026-10-04')).toBe('fit-tracker-sets-2026-10-04.csv');
  });
});

describe('loadCsvSources', () => {
  beforeEach(resetDb);

  it('reads the tables the exports need', async () => {
    await db.sessions.bulkPut([sessionRow('s1'), sessionRow('s2')]);
    await db.set_entries.put(setRow('a', 'c1'));
    const loaded = await loadCsvSources();
    expect(loaded.sessions).toHaveLength(2);
    expect(loaded.sets).toHaveLength(1);
  });
});
