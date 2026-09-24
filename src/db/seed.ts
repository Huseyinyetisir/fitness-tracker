import type { Exercise } from '../types/domain';
import { db } from './schema';
import { insertRow } from './repo';

type SeedExercise = Omit<Exercise, keyof import('../types/domain').BaseRow>;

function strength(
  name: string,
  muscle_group: string,
  default_reps: number,
  sort_order: number,
): SeedExercise {
  return {
    name,
    muscle_group,
    modality: 'strength',
    run_type: null,
    default_sets: 3,
    default_reps,
    default_weight_kg: null,
    default_duration_s: null,
    default_distance_km: null,
    sort_order,
  };
}

function run(
  name: string,
  run_type: Exercise['run_type'],
  distanceKm: number,
  durationS: number,
  sort_order: number,
): SeedExercise {
  return {
    name,
    muscle_group: 'cardio',
    modality: 'cardio',
    run_type,
    default_sets: null,
    default_reps: null,
    default_weight_kg: null,
    default_duration_s: durationS,
    default_distance_km: distanceKm,
    sort_order,
  };
}

export const SEED_EXERCISES: SeedExercise[] = [
  // Legs
  strength('Back Squat', 'legs', 5, 1),
  strength('Front Squat', 'legs', 5, 2),
  strength('Romanian Deadlift', 'legs', 8, 3),
  strength('Conventional Deadlift', 'legs', 5, 4),
  strength('Bulgarian Split Squat', 'legs', 8, 5),
  strength('Walking Lunge', 'legs', 10, 6),
  strength('Leg Press', 'legs', 10, 7),
  strength('Leg Extension', 'legs', 12, 8),
  strength('Leg Curl', 'legs', 12, 9),
  strength('Hip Thrust', 'legs', 8, 10),
  strength('Standing Calf Raise', 'legs', 12, 11),
  strength('Seated Calf Raise', 'legs', 15, 12),
  strength('Goblet Squat', 'legs', 10, 13),
  strength('Hack Squat', 'legs', 8, 14),

  // Chest
  strength('Barbell Bench Press', 'chest', 5, 20),
  strength('Incline Barbell Bench Press', 'chest', 8, 21),
  strength('Dumbbell Bench Press', 'chest', 8, 22),
  strength('Incline Dumbbell Press', 'chest', 10, 23),
  strength('Cable Fly', 'chest', 12, 24),
  strength('Push-Up', 'chest', 12, 25),
  strength('Dip', 'chest', 8, 26),

  // Back
  strength('Pull-Up', 'back', 8, 30),
  strength('Chin-Up', 'back', 8, 31),
  strength('Lat Pulldown', 'back', 10, 32),
  strength('Barbell Row', 'back', 8, 33),
  strength('Pendlay Row', 'back', 5, 34),
  strength('Seated Cable Row', 'back', 10, 35),
  strength('Single-Arm Dumbbell Row', 'back', 10, 36),
  strength('Face Pull', 'back', 15, 37),
  strength('Barbell Shrug', 'back', 12, 38),

  // Shoulders
  strength('Overhead Press', 'shoulders', 5, 40),
  strength('Seated Dumbbell Press', 'shoulders', 8, 41),
  strength('Arnold Press', 'shoulders', 10, 42),
  strength('Lateral Raise', 'shoulders', 15, 43),
  strength('Rear Delt Fly', 'shoulders', 15, 44),

  // Arms
  strength('Barbell Curl', 'arms', 10, 50),
  strength('Dumbbell Curl', 'arms', 10, 51),
  strength('Hammer Curl', 'arms', 12, 52),
  strength('Preacher Curl', 'arms', 12, 53),
  strength('Triceps Pushdown', 'arms', 12, 54),
  strength('Overhead Triceps Extension', 'arms', 12, 55),
  strength('Close-Grip Bench Press', 'arms', 8, 56),

  // Core
  strength('Plank', 'core', 1, 60),
  strength('Hanging Leg Raise', 'core', 12, 61),
  strength('Cable Crunch', 'core', 15, 62),
  strength('Ab Wheel Rollout', 'core', 10, 63),
  strength('Back Extension', 'core', 12, 64),

  // Runs
  run('Easy Run', 'easy', 8, 3000, 100),
  run('Tempo Run', 'tempo', 8, 2700, 101),
  run('Interval Session', 'intervals', 8, 3000, 102),
  run('Long Run', 'long', 15, 5400, 103),
];

/**
 * Populates the exercise library on first launch. No-op if any exercise
 * already exists, so a re-run after the user has edited the library cannot
 * resurrect defaults they deleted or overwrite renames.
 *
 * The count and the inserts run in one read-write transaction. Without that,
 * two concurrent callers — which React StrictMode produces on every mount in
 * development — both observe an empty table and both seed it.
 */
export async function seedExercises(): Promise<number> {
  return db.transaction('rw', db.exercises, async () => {
    const existing = await db.exercises.count();
    if (existing > 0) return 0;

    for (const e of SEED_EXERCISES) {
      await insertRow<Exercise>('exercises', e);
    }
    return SEED_EXERCISES.length;
  });
}
