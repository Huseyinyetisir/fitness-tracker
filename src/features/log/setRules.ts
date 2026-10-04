/** 1, 1.5, 2 … 10. */
export const RPE_STEPS: readonly number[] = Array.from({ length: 19 }, (_, i) => 1 + i * 0.5);

export function isValidRpe(value: number | null): value is number {
  return value !== null && value >= 1 && value <= 10 && Number.isInteger(value * 2);
}

/** A set being entered. RPE is null until the user taps one — it is never guessed. */
export interface SetDraft {
  reps: number;
  weight_kg: number;
  rpe: number | null;
  is_warmup: boolean;
}

export type SetErrors = Partial<Record<'reps' | 'weight_kg' | 'rpe', string>>;

export function validateSet(draft: SetDraft): SetErrors {
  const errors: SetErrors = {};
  if (!Number.isInteger(draft.reps) || draft.reps < 1 || draft.reps > 100) errors.reps = 'Reps must be 1–100';
  if (!(draft.weight_kg >= 0 && draft.weight_kg <= 1000)) errors.weight_kg = 'Weight must be 0–1000 kg';
  if (!isValidRpe(draft.rpe)) errors.rpe = 'Rate this set — RPE 1 to 10';
  return errors;
}

export type FinishedStatus = 'done' | 'partial' | 'skipped';

/**
 * The status to pre-select when finishing. Pass strength exercises only — a
 * run inside a session is logged separately and has no sets.
 */
export function suggestStatus(exercises: { targetSets: number | null; workingSets: number }[]): FinishedStatus {
  const logged = exercises.reduce((n, e) => n + e.workingSets, 0);
  if (logged === 0) return 'skipped';
  return exercises.every((e) => e.workingSets >= (e.targetSets ?? 1)) ? 'done' : 'partial';
}
