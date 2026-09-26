import { describe, it, expect } from 'vitest';
import { meanRPE, fatigueFlag, type LoadPoint } from './rpe';
import type { SetEntry } from '../types/domain';

function set(partial: Partial<SetEntry>): SetEntry {
  return {
    id: 'x',
    user_id: null,
    created_at: '2026-09-22T06:00:00.000Z',
    updated_at: '2026-09-22T06:00:00.000Z',
    server_updated_at: null,
    deleted_at: null,
    session_exercise_id: 'se1',
    set_index: 0,
    reps: 5,
    weight_kg: 100,
    rpe: 8,
    is_warmup: false,
    notes: null,
    ...partial,
  };
}

function lp(date: string, rpe: number, topSetLoad: number): LoadPoint {
  return { date, rpe, top_set_load: topSetLoad };
}

describe('meanRPE', () => {
  it('averages working sets', () => {
    expect(meanRPE([set({ rpe: 7 }), set({ rpe: 9 })])).toBe(8);
  });

  it('excludes warm-ups', () => {
    expect(meanRPE([set({ rpe: 5, is_warmup: true }), set({ rpe: 9 })])).toBe(9);
  });

  it('handles half steps', () => {
    expect(meanRPE([set({ rpe: 7.5 }), set({ rpe: 8.5 })])).toBe(8);
  });

  it('returns null for no working sets', () => {
    expect(meanRPE([])).toBeNull();
  });
});

describe('fatigueFlag', () => {
  // Window: 2026-09-22 back 14 days = recent; the 14 days before that = prior.
  const asOf = '2026-09-22';

  it('flags when RPE rises by 0.5 or more at flat load', () => {
    const points = [
      lp('2026-09-02', 7, 100),
      lp('2026-09-05', 7, 100),
      lp('2026-09-16', 8, 100),
      lp('2026-09-19', 8, 100),
    ];
    const r = fatigueFlag(points, asOf);
    expect(r.flagged).toBe(true);
    expect(r.rpe_delta).toBeCloseTo(1, 5);
    expect(r.load_change_pct).toBeCloseTo(0, 5);
  });

  it('does not flag when load rose alongside RPE', () => {
    const points = [
      lp('2026-09-02', 7, 100),
      lp('2026-09-05', 7, 100),
      lp('2026-09-16', 8, 110),
      lp('2026-09-19', 8, 110),
    ];
    expect(fatigueFlag(points, asOf).flagged).toBe(false);
  });

  it('does not flag when the RPE rise is below 0.5', () => {
    const points = [
      lp('2026-09-02', 7, 100),
      lp('2026-09-16', 7.4, 100),
    ];
    expect(fatigueFlag(points, asOf).flagged).toBe(false);
  });

  it('flags at exactly 0.5 and exactly +1% load', () => {
    const points = [
      lp('2026-09-02', 7, 100),
      lp('2026-09-16', 7.5, 101),
    ];
    expect(fatigueFlag(points, asOf).flagged).toBe(true);
  });

  it('does not flag when either window is empty', () => {
    expect(fatigueFlag([lp('2026-09-16', 9, 100)], asOf).flagged).toBe(false);
    expect(fatigueFlag([lp('2026-09-02', 9, 100)], asOf).flagged).toBe(false);
  });

  it('ignores points outside both windows', () => {
    const points = [
      lp('2026-05-01', 3, 200), // far past, must not pollute the prior window
      lp('2026-09-02', 7, 100),
      lp('2026-09-16', 8, 100),
    ];
    expect(fatigueFlag(points, asOf).flagged).toBe(true);
  });

  it('does not flag when the prior window has no load to compare against', () => {
    // Bodyweight work logged at 0kg, then loaded. Load rose; this is not fatigue.
    const points = [lp('2026-09-02', 7, 0), lp('2026-09-16', 8, 20)];
    const r = fatigueFlag(points, asOf);
    expect(r.flagged).toBe(false);
    expect(r.load_change_pct).toBeNull();
  });

  it('still reports the rpe delta when load cannot be compared', () => {
    const points = [lp('2026-09-02', 7, 0), lp('2026-09-16', 8, 0)];
    const r = fatigueFlag(points, asOf);
    expect(r.flagged).toBe(false);
    expect(r.rpe_delta).toBeCloseTo(1, 5);
  });
});
