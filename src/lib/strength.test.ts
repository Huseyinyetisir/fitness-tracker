import { describe, it, expect } from 'vitest';
import { epley1RM, setVolume, totalVolume, bestE1RM, repMaxes } from './strength';
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

describe('epley1RM', () => {
  it('returns the weight itself for a single rep', () => {
    expect(epley1RM(100, 1)).toBe(100);
  });

  it('applies the Epley formula for multiple reps', () => {
    // 100 * (1 + 5/30) = 116.666...
    expect(epley1RM(100, 5)).toBeCloseTo(116.667, 3);
  });

  it('returns 0 for zero or negative reps', () => {
    expect(epley1RM(100, 0)).toBe(0);
    expect(epley1RM(100, -3)).toBe(0);
  });

  it('returns 0 for zero or negative weight', () => {
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(-20, 5)).toBe(0);
  });
});

describe('setVolume', () => {
  it('multiplies reps by weight', () => {
    expect(setVolume(set({ reps: 5, weight_kg: 100 }))).toBe(500);
  });
});

describe('totalVolume', () => {
  it('sums working sets', () => {
    const sets = [
      set({ reps: 5, weight_kg: 100 }),
      set({ reps: 5, weight_kg: 90 }),
    ];
    expect(totalVolume(sets)).toBe(950);
  });

  it('excludes warm-up sets', () => {
    const sets = [
      set({ reps: 10, weight_kg: 40, is_warmup: true }),
      set({ reps: 5, weight_kg: 100 }),
    ];
    expect(totalVolume(sets)).toBe(500);
  });

  it('excludes soft-deleted sets', () => {
    const sets = [
      set({ reps: 5, weight_kg: 100 }),
      set({ reps: 5, weight_kg: 100, deleted_at: '2026-09-22T07:00:00.000Z' }),
    ];
    expect(totalVolume(sets)).toBe(500);
  });

  it('returns 0 for an empty list', () => {
    expect(totalVolume([])).toBe(0);
  });
});

describe('bestE1RM', () => {
  it('picks the highest estimated 1RM across working sets', () => {
    const sets = [
      set({ reps: 5, weight_kg: 100 }), // 116.67
      set({ reps: 2, weight_kg: 115 }), // 122.67
      set({ reps: 8, weight_kg: 90 }),  // 114.00
    ];
    expect(bestE1RM(sets)).toBeCloseTo(122.667, 3);
  });

  it('ignores warm-ups even when they would score higher', () => {
    const sets = [
      set({ reps: 1, weight_kg: 200, is_warmup: true }),
      set({ reps: 5, weight_kg: 100 }),
    ];
    expect(bestE1RM(sets)).toBeCloseTo(116.667, 3);
  });

  it('returns 0 when there are no working sets', () => {
    expect(bestE1RM([])).toBe(0);
  });
});

describe('repMaxes', () => {
  it('records the best weight for each rep count', () => {
    const sets = [
      set({ reps: 5, weight_kg: 100 }),
      set({ reps: 5, weight_kg: 105 }),
      set({ reps: 3, weight_kg: 110 }),
    ];
    const rm = repMaxes(sets);
    expect(rm.get(5)).toBe(105);
    expect(rm.get(3)).toBe(110);
  });

  it('ignores rep counts above 12', () => {
    const rm = repMaxes([set({ reps: 15, weight_kg: 60 })]);
    expect(rm.has(15)).toBe(false);
  });

  it('ignores warm-ups', () => {
    const rm = repMaxes([set({ reps: 5, weight_kg: 200, is_warmup: true })]);
    expect(rm.has(5)).toBe(false);
  });
});
