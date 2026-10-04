import type { BaseRow, Exercise, Modality, RunType } from '../../types/domain';

export interface ExerciseFilter {
  search: string;
  modality: Modality | 'all';
  /** A muscle group, or 'all'. */
  muscleGroup: string;
}

export const NO_FILTER: ExerciseFilter = { search: '', modality: 'all', muscleGroup: 'all' };

/** Live exercises matching the filter, in library order. */
export function filterExercises<E extends Exercise>(rows: E[], filter: ExerciseFilter): E[] {
  const query = filter.search.trim().toLowerCase();
  return rows
    .filter((e) => e.deleted_at === null)
    .filter((e) => filter.modality === 'all' || e.modality === filter.modality)
    .filter((e) => filter.muscleGroup === 'all' || e.muscle_group === filter.muscleGroup)
    .filter((e) => query === '' || e.name.toLowerCase().includes(query))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export function muscleGroups(rows: Exercise[]): string[] {
  const groups = rows
    .filter((e) => e.deleted_at === null && e.muscle_group)
    .map((e) => e.muscle_group as string);
  return [...new Set(groups)].sort();
}

export type ExerciseInput = Omit<Exercise, keyof BaseRow | 'sort_order'>;

export const EMPTY_EXERCISE: ExerciseInput = {
  name: '',
  muscle_group: null,
  modality: 'strength',
  run_type: null,
  default_sets: 3,
  default_reps: 8,
  default_weight_kg: null,
  default_duration_s: null,
  default_distance_km: null,
};

export function toInput(e: Exercise): ExerciseInput {
  return {
    name: e.name,
    muscle_group: e.muscle_group,
    modality: e.modality,
    run_type: e.run_type,
    default_sets: e.default_sets,
    default_reps: e.default_reps,
    default_weight_kg: e.default_weight_kg,
    default_duration_s: e.default_duration_s,
    default_distance_km: e.default_distance_km,
  };
}

/** Trims text and drops the fields that do not belong to the exercise's modality. */
export function normalizeExercise(input: ExerciseInput): ExerciseInput {
  const strength = input.modality === 'strength';
  return {
    ...input,
    name: input.name.trim(),
    muscle_group: input.muscle_group?.trim() || null,
    run_type: strength ? null : (input.run_type ?? 'easy'),
    default_sets: strength ? input.default_sets : null,
    default_reps: strength ? input.default_reps : null,
    default_weight_kg: strength ? input.default_weight_kg : null,
    default_duration_s: strength ? null : input.default_duration_s,
    default_distance_km: strength ? null : input.default_distance_km,
  };
}

export type ExerciseErrors = Partial<Record<keyof ExerciseInput, string>>;

export function validateExercise(input: ExerciseInput): ExerciseErrors {
  const e = normalizeExercise(input);
  const errors: ExerciseErrors = {};
  const wholeAboveZero = (v: number | null) => v === null || (Number.isInteger(v) && v > 0);

  if (!e.name) errors.name = 'Name is required';
  if (!wholeAboveZero(e.default_sets)) errors.default_sets = 'A whole number above 0';
  if (!wholeAboveZero(e.default_reps)) errors.default_reps = 'A whole number above 0';
  if (e.default_weight_kg !== null && !(e.default_weight_kg >= 0 && e.default_weight_kg <= 1000)) {
    errors.default_weight_kg = 'Between 0 and 1000 kg';
  }
  if (e.default_distance_km !== null && !(e.default_distance_km > 0 && e.default_distance_km <= 300)) {
    errors.default_distance_km = 'Between 0 and 300 km';
  }
  if (e.default_duration_s !== null && !(Number.isInteger(e.default_duration_s) && e.default_duration_s > 0)) {
    errors.default_duration_s = 'Above 0';
  }
  return errors;
}

export const RUN_TYPE_LABELS: Record<RunType, string> = {
  easy: 'Easy',
  tempo: 'Tempo',
  intervals: 'Intervals',
  long: 'Long',
};

/** One line under an exercise's name: "Legs · 3×5 · 100 kg" or "Long · 15 km · 90 min". */
export function exerciseSummary(e: Exercise): string {
  const parts: string[] = [];
  if (e.modality === 'cardio') {
    parts.push(e.run_type ? RUN_TYPE_LABELS[e.run_type] : 'Run');
    if (e.default_distance_km) parts.push(`${e.default_distance_km} km`);
    if (e.default_duration_s) parts.push(`${Math.round(e.default_duration_s / 60)} min`);
    return parts.join(' · ');
  }
  if (e.muscle_group) parts.push(e.muscle_group.charAt(0).toUpperCase() + e.muscle_group.slice(1));
  if (e.default_sets && e.default_reps) parts.push(`${e.default_sets}×${e.default_reps}`);
  if (e.default_weight_kg) parts.push(`${e.default_weight_kg} kg`);
  return parts.join(' · ');
}
