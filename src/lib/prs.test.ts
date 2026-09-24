import { describe, it, expect } from 'vitest';
import { detectPRs, type DatedSet } from './prs';

function ds(date: string, reps: number, weight: number, extra: Partial<DatedSet> = {}): DatedSet {
  return {
    set_id: `${date}-${reps}-${weight}`,
    date,
    reps,
    weight_kg: weight,
    is_warmup: false,
    ...extra,
  };
}

describe('detectPRs', () => {
  it('emits an e1rm PR and a rep_max PR for the first working set', () => {
    const prs = detectPRs([ds('2026-09-01', 5, 100)]);
    expect(prs).toEqual([
      { date: '2026-09-01', kind: 'rep_max', reps: 5, value: 100, set_id: '2026-09-01-5-100' },
      {
        date: '2026-09-01',
        kind: 'e1rm',
        reps: 5,
        value: epley(100, 5),
        set_id: '2026-09-01-5-100',
      },
    ]);
  });

  it('does not emit when a later set fails to beat the best', () => {
    const prs = detectPRs([ds('2026-09-01', 5, 100), ds('2026-09-08', 5, 95)]);
    expect(prs.filter((p) => p.date === '2026-09-08')).toEqual([]);
  });

  it('emits a rep_max PR without an e1rm PR when only the rep max improves', () => {
    // 8x95 -> e1rm 120.33 ; 3x110 -> e1rm 121.0 ; 5x100 -> e1rm 116.67 (no e1rm PR)
    const prs = detectPRs([
      ds('2026-09-01', 3, 110),
      ds('2026-09-08', 8, 95),
      ds('2026-09-15', 5, 100),
    ]);
    const sept15 = prs.filter((p) => p.date === '2026-09-15');
    expect(sept15).toEqual([
      { date: '2026-09-15', kind: 'rep_max', reps: 5, value: 100, set_id: '2026-09-15-5-100' },
    ]);
  });

  it('ignores warm-up sets entirely', () => {
    const prs = detectPRs([ds('2026-09-01', 1, 300, { is_warmup: true })]);
    expect(prs).toEqual([]);
  });

  it('processes out-of-order input chronologically', () => {
    const prs = detectPRs([ds('2026-09-08', 5, 95), ds('2026-09-01', 5, 100)]);
    expect(prs.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-01']);
  });

  it('returns an empty list for no sets', () => {
    expect(detectPRs([])).toEqual([]);
  });
});

function epley(w: number, r: number): number {
  return r === 1 ? w : w * (1 + r / 30);
}
