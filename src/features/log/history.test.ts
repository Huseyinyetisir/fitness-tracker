import { describe, it, expect } from 'vitest';
import { base } from '../../test/fixtures';
import type { Local, Run, Session } from '../../types/domain';
import type { SessionCard } from './cards';
import { buildHistory, groupByWeek, heatmap, historyState } from './history';

const TODAY = '2026-10-07'; // a Wednesday

function card(id: string, date: string, extra: Partial<Session> = {}, work: Partial<SessionCard> = {}): SessionCard {
  const session: Local<Session> = {
    ...base(id),
    date,
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
  return { session, title: id, workingSets: 0, targetSets: 3, volumeKg: 0, avgRpe: null, run: null, ...work };
}

const RUN: Local<Run> = {
  ...base('r'),
  session_id: 'x',
  exercise_id: 'e',
  run_type: 'easy',
  distance_km: 5,
  duration_s: 1500,
  rpe: 6,
  avg_hr: null,
  weather: null,
  route_note: null,
};

describe('historyState', () => {
  it('passes finished statuses through', () => {
    expect(historyState(card('a', '2026-10-05', { status: 'done' }), TODAY)).toBe('done');
    expect(historyState(card('a', '2026-10-05', { status: 'partial' }), TODAY)).toBe('partial');
    expect(historyState(card('a', '2026-10-05', { status: 'skipped' }), TODAY)).toBe('skipped');
  });

  it('calls an untouched past planned session missed', () => {
    expect(historyState(card('a', '2026-10-05'), TODAY)).toBe('missed');
  });

  it('calls a past session with work but no finish unfinished', () => {
    expect(historyState(card('a', '2026-10-05', {}, { workingSets: 2 }), TODAY)).toBe('unfinished');
    expect(historyState(card('a', '2026-10-05', {}, { run: RUN }), TODAY)).toBe('unfinished');
  });

  it("leaves today's and future plans to Today and Plan", () => {
    expect(historyState(card('a', TODAY), TODAY)).toBeNull();
    expect(historyState(card('a', '2026-10-09'), TODAY)).toBeNull();
  });

  it("shows today's session once work is logged in it", () => {
    expect(historyState(card('a', TODAY, {}, { workingSets: 1 }), TODAY)).toBe('unfinished');
  });

  it('drops an abandoned unplanned draft', () => {
    expect(historyState(card('a', '2026-10-05', { was_planned: false }), TODAY)).toBeNull();
  });
});

describe('buildHistory', () => {
  it('keeps only history, newest first', () => {
    const entries = buildHistory(
      [
        card('old', '2026-09-28', { status: 'done' }),
        card('future', '2026-10-09'),
        card('new', '2026-10-06', { status: 'done' }),
        card('missed', '2026-10-05'),
      ],
      TODAY,
    );
    expect(entries.map((e) => [e.session.id, e.state])).toEqual([
      ['new', 'done'],
      ['missed', 'missed'],
      ['old', 'done'],
    ]);
  });
});

describe('groupByWeek', () => {
  it('groups newest-first entries into Monday-start weeks', () => {
    const entries = buildHistory(
      [
        card('a', '2026-10-06', { status: 'done' }),
        card('b', '2026-10-05', { status: 'done' }),
        card('c', '2026-10-04', { status: 'done' }),
      ],
      TODAY,
    );
    expect(groupByWeek(entries).map((g) => [g.weekStart, g.entries.map((e) => e.session.id)])).toEqual([
      ['2026-10-05', ['a', 'b']],
      ['2026-09-28', ['c']],
    ]);
  });
});

describe('heatmap', () => {
  it('lays out twelve Monday-to-Sunday weeks ending with this one', () => {
    const grid = heatmap([], TODAY);
    expect(grid).toHaveLength(12);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0][0].date).toBe('2026-07-20');
    expect(grid[11][0].date).toBe('2026-10-05');
    expect(grid[11][6].date).toBe('2026-10-11');
  });

  it('marks future days', () => {
    const grid = heatmap([], TODAY);
    expect(grid[11][2].future).toBe(false);
    expect(grid[11][3].future).toBe(true);
  });

  it('grades a day by what was completed', () => {
    const grid = heatmap(
      [
        { date: '2026-10-05', status: 'partial' },
        { date: '2026-10-06', status: 'done' },
        { date: '2026-10-07', status: 'done' },
        { date: '2026-10-07', status: 'done' },
        { date: '2026-10-08', status: 'skipped' },
      ],
      TODAY,
    );
    expect(grid[11].slice(0, 4).map((c) => c.level)).toEqual([1, 2, 3, 0]);
  });
});
