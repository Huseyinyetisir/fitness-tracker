import { describe, it, expect } from 'vitest';
import { RPE_STEPS, isValidRpe, suggestStatus, validateSet } from './setRules';

describe('RPE_STEPS', () => {
  it('runs from 1 to 10 in half steps', () => {
    expect(RPE_STEPS).toHaveLength(19);
    expect(RPE_STEPS[0]).toBe(1);
    expect(RPE_STEPS[1]).toBe(1.5);
    expect(RPE_STEPS.at(-1)).toBe(10);
  });
});

describe('isValidRpe', () => {
  it('accepts whole and half steps in range', () => {
    expect(isValidRpe(7)).toBe(true);
    expect(isValidRpe(7.5)).toBe(true);
    expect(isValidRpe(1)).toBe(true);
    expect(isValidRpe(10)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidRpe(null)).toBe(false);
    expect(isValidRpe(7.3)).toBe(false);
    expect(isValidRpe(0.5)).toBe(false);
    expect(isValidRpe(10.5)).toBe(false);
    expect(isValidRpe(Number.NaN)).toBe(false);
  });
});

describe('validateSet', () => {
  const ok = { reps: 5, weight_kg: 100, rpe: 8, is_warmup: false };

  it('accepts a complete set', () => {
    expect(validateSet(ok)).toEqual({});
  });

  it('refuses a set without an RPE', () => {
    expect(validateSet({ ...ok, rpe: null }).rpe).toBeDefined();
  });

  it('requires whole reps from 1 to 100', () => {
    expect(validateSet({ ...ok, reps: 0 }).reps).toBeDefined();
    expect(validateSet({ ...ok, reps: 2.5 }).reps).toBeDefined();
    expect(validateSet({ ...ok, reps: 101 }).reps).toBeDefined();
  });

  it('allows bodyweight but not negative or absurd loads', () => {
    expect(validateSet({ ...ok, weight_kg: 0 })).toEqual({});
    expect(validateSet({ ...ok, weight_kg: -5 }).weight_kg).toBeDefined();
    expect(validateSet({ ...ok, weight_kg: 1001 }).weight_kg).toBeDefined();
    expect(validateSet({ ...ok, weight_kg: Number.NaN }).weight_kg).toBeDefined();
  });
});

describe('suggestStatus', () => {
  it('is skipped when nothing was logged', () => {
    expect(suggestStatus([{ targetSets: 3, workingSets: 0 }])).toBe('skipped');
    expect(suggestStatus([])).toBe('skipped');
  });

  it('is done when every target was met', () => {
    expect(suggestStatus([{ targetSets: 3, workingSets: 3 }, { targetSets: 2, workingSets: 4 }])).toBe('done');
  });

  it('is partial when some work is missing', () => {
    expect(suggestStatus([{ targetSets: 3, workingSets: 3 }, { targetSets: 3, workingSets: 1 }])).toBe('partial');
  });

  it('treats an exercise with no target as wanting one set', () => {
    expect(suggestStatus([{ targetSets: null, workingSets: 1 }])).toBe('done');
    expect(suggestStatus([{ targetSets: 3, workingSets: 3 }, { targetSets: null, workingSets: 0 }])).toBe('partial');
  });
});
