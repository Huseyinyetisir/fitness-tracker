import { describe, it, expect } from 'vitest';
import type { Exercise } from '../../types/domain';
import {
  EMPTY_EXERCISE,
  NO_FILTER,
  exerciseSummary,
  filterExercises,
  muscleGroups,
  normalizeExercise,
  validateExercise,
} from './exerciseRules';

function ex(id: string, partial: Partial<Exercise> = {}): Exercise {
  return {
    id,
    user_id: null,
    created_at: '',
    updated_at: '',
    server_updated_at: null,
    deleted_at: null,
    name: id,
    muscle_group: 'legs',
    modality: 'strength',
    run_type: null,
    default_sets: 3,
    default_reps: 5,
    default_weight_kg: null,
    default_duration_s: null,
    default_distance_km: null,
    sort_order: 0,
    ...partial,
  };
}

describe('filterExercises', () => {
  const rows = [
    ex('Back Squat', { sort_order: 2 }),
    ex('Bench Press', { muscle_group: 'chest', sort_order: 1 }),
    ex('Easy Run', { modality: 'cardio', muscle_group: 'cardio', sort_order: 9 }),
    ex('Gone', { deleted_at: '2026-01-01T00:00:00.000Z' }),
  ];

  it('drops deleted exercises and sorts by sort order', () => {
    expect(filterExercises(rows, NO_FILTER).map((e) => e.id)).toEqual(['Bench Press', 'Back Squat', 'Easy Run']);
  });

  it('searches names case-insensitively', () => {
    expect(filterExercises(rows, { ...NO_FILTER, search: 'SQU' }).map((e) => e.id)).toEqual(['Back Squat']);
  });

  it('filters by modality', () => {
    expect(filterExercises(rows, { ...NO_FILTER, modality: 'cardio' }).map((e) => e.id)).toEqual(['Easy Run']);
  });

  it('filters by muscle group', () => {
    expect(filterExercises(rows, { ...NO_FILTER, muscleGroup: 'chest' }).map((e) => e.id)).toEqual(['Bench Press']);
  });

  it('lists distinct muscle groups of live exercises', () => {
    expect(muscleGroups(rows)).toEqual(['cardio', 'chest', 'legs']);
  });
});

describe('normalizeExercise', () => {
  it('trims text and keeps only strength fields for a strength exercise', () => {
    const n = normalizeExercise({
      ...EMPTY_EXERCISE,
      name: '  Squat ',
      muscle_group: ' ',
      run_type: 'easy',
      default_distance_km: 5,
    });
    expect(n.name).toBe('Squat');
    expect(n.muscle_group).toBeNull();
    expect(n.run_type).toBeNull();
    expect(n.default_distance_km).toBeNull();
    expect(n.default_sets).toBe(3);
  });

  it('keeps only cardio fields for a cardio exercise and defaults the run type', () => {
    const n = normalizeExercise({ ...EMPTY_EXERCISE, name: 'Run', modality: 'cardio', default_distance_km: 8 });
    expect(n.run_type).toBe('easy');
    expect(n.default_sets).toBeNull();
    expect(n.default_reps).toBeNull();
    expect(n.default_distance_km).toBe(8);
  });
});

describe('validateExercise', () => {
  it('accepts a valid exercise', () => {
    expect(validateExercise({ ...EMPTY_EXERCISE, name: 'Squat' })).toEqual({});
  });

  it('requires a name', () => {
    expect(validateExercise({ ...EMPTY_EXERCISE, name: '   ' }).name).toBeDefined();
  });

  it('rejects fractional sets', () => {
    expect(validateExercise({ ...EMPTY_EXERCISE, name: 'Squat', default_sets: 2.5 }).default_sets).toBeDefined();
  });

  it('rejects an unparseable weight', () => {
    expect(validateExercise({ ...EMPTY_EXERCISE, name: 'Squat', default_weight_kg: Number.NaN }).default_weight_kg).toBeDefined();
  });

  it('ignores strength fields on a cardio exercise', () => {
    expect(validateExercise({ ...EMPTY_EXERCISE, name: 'Run', modality: 'cardio', default_sets: 2.5 })).toEqual({});
  });
});

describe('exerciseSummary', () => {
  it('summarises a strength exercise', () => {
    expect(exerciseSummary(ex('Squat', { default_weight_kg: 100 }))).toBe('Legs · 3×5 · 100 kg');
  });

  it('summarises a run', () => {
    expect(
      exerciseSummary(ex('Long Run', { modality: 'cardio', run_type: 'long', default_distance_km: 15, default_duration_s: 5400 })),
    ).toBe('Long · 15 km · 90 min');
  });
});
