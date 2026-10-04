import { db } from '../../db/schema';
import { insertRow, softDeleteRow } from '../../db/repo';
import { DEMO_NOTE } from '../../lib/demoNote';
import { addDays, daysBetween, parseISODate, startOfWeek } from '../../lib/time';
import type {
  BodyMetric,
  Exercise,
  ISODate,
  Local,
  Run,
  Session,
  SessionExercise,
  SetEntry,
  WorkoutTemplate,
  WorkoutTemplateItem,
} from '../../types/domain';
import { removeSession } from '../log/sessionsRepo';
import { deleteWorkout } from '../plan/workoutsRepo';

export { DEMO_NOTE };

/** Whole weeks of history before the current one. */
export const DEMO_WEEKS = 12;

export interface DemoSet {
  reps: number;
  weight_kg: number;
  rpe: number;
}

export interface DemoSession {
  date: ISODate;
  status: 'done' | 'partial' | 'skipped';
  energy: number | null;
  /** 'A' or 'B' for a strength day; null for a run. */
  workout: 'A' | 'B' | null;
  lifts: { exercise: string; sets: DemoSet[] }[];
  run: { exercise: string; distance_km: number; duration_s: number; rpe: number; avg_hr: number } | null;
}

export interface DemoBody {
  date: ISODate;
  weight_kg: number;
  resting_hr: number;
}

export const DEMO_WORKOUTS = {
  A: { name: 'Demo — Squat & Bench', exercises: ['Back Squat', 'Barbell Bench Press', 'Barbell Row'] },
  B: { name: 'Demo — Deadlift & Press', exercises: ['Conventional Deadlift', 'Overhead Press', 'Pull-Up'] },
} as const;

/** Small deterministic PRNG, so the demo is the same every time and tests can rely on it. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const plate = (kg: number) => Math.round(kg / 2.5) * 2.5;
const halfStep = (rpe: number) => Math.min(10, Math.max(6, Math.round(rpe * 2) / 2));

/**
 * Twelve weeks of a plausible program ending yesterday: two alternating
 * strength days on Monday, Wednesday and Friday with steady progression and a
 * deload in week 7, runs on Tuesday, Thursday and Saturday, a weekly weigh-in.
 *
 * The bench press stalls for the last four weeks while its RPE climbs over
 * the last two, so the fatigue banner has something to show.
 */
export function buildDemo(todayDate: ISODate, seed = 7): { sessions: DemoSession[]; body: DemoBody[] } {
  const rand = mulberry32(seed);
  const jitter = (spread: number) => (rand() - 0.5) * 2 * spread;
  const firstMonday = addDays(startOfWeek(todayDate), -7 * DEMO_WEEKS);
  const sessions: DemoSession[] = [];
  const body: DemoBody[] = [];

  for (let week = 0; week <= DEMO_WEEKS; week++) {
    const monday = addDays(firstMonday, week * 7);
    const deload = week === 6;
    const effort = deload ? 6.5 : 7 + week * 0.08;

    for (let day = 0; day < 7; day++) {
      const date = addDays(monday, day);
      if (date >= todayDate) break;
      const daysAgo = daysBetween(date, todayDate);

      if (day === 0) {
        body.push({
          date,
          weight_kg: Math.round((82 - week * 0.12 + jitter(0.3)) * 10) / 10,
          resting_hr: Math.round(58 - week * 0.3 + jitter(1)),
        });
      }

      if (day === 0 || day === 2 || day === 4) {
        const workout = day === 2 ? 'B' : 'A';
        const skipped = rand() < 0.07;
        const partial = !skipped && rand() < 0.06;
        const lifts = workout === 'A'
          ? [
              lift('Back Squat', 5, 5, plate((80 + week * 2.5) * (deload ? 0.9 : 1)), effort),
              benchLift(week, daysAgo, deload, effort),
              lift('Barbell Row', 3, 8, plate((50 + week * 1.25) * (deload ? 0.9 : 1)), effort - 0.5),
            ]
          : [
              lift('Conventional Deadlift', 3, 5, plate((100 + week * 5) * (deload ? 0.9 : 1)), effort + 0.5),
              lift('Overhead Press', 5, 5, plate((40 + week * 0.625) * (deload ? 0.9 : 1)), effort),
              lift('Pull-Up', 3, 8, 0, effort),
            ];
        sessions.push({
          date,
          status: skipped ? 'skipped' : partial ? 'partial' : 'done',
          energy: skipped ? null : 2 + Math.floor(rand() * 4),
          workout,
          lifts: skipped ? [] : partial ? lifts.slice(0, 2) : lifts,
          run: null,
        });
      }

      if (day === 1 || day === 3 || day === 5) {
        const run =
          day === 1
            ? { exercise: 'Easy Run', distance_km: 6 + (week % 3), pace: 360 - week * 1.5, rpe: 5.5, avg_hr: 140 }
            : day === 5
              ? { exercise: 'Long Run', distance_km: 12 + Math.floor(week / 2), pace: 375 - week, rpe: 7, avg_hr: 145 }
              : week % 2 === 0
                ? { exercise: 'Tempo Run', distance_km: 6, pace: 300 - week * 1.2, rpe: 8, avg_hr: 165 }
                : { exercise: 'Interval Session', distance_km: 8, pace: 320 - week, rpe: 8.5, avg_hr: 160 };
        const skipped = rand() < 0.07;
        sessions.push({
          date,
          status: skipped ? 'skipped' : 'done',
          energy: skipped ? null : 2 + Math.floor(rand() * 4),
          workout: null,
          lifts: [],
          run: skipped
            ? null
            : {
                exercise: run.exercise,
                distance_km: run.distance_km,
                duration_s: Math.round(run.distance_km * (run.pace + jitter(8))),
                rpe: halfStep(run.rpe + jitter(0.5)),
                avg_hr: Math.round(run.avg_hr + jitter(4)),
              },
        });
      }
    }
  }
  return { sessions, body };

  function lift(exercise: string, sets: number, reps: number, weight_kg: number, rpe: number) {
    return {
      exercise,
      sets: Array.from({ length: sets }, (_, i) => ({
        reps,
        weight_kg,
        // The last sets of a session feel harder than the first.
        rpe: halfStep(rpe + (i / Math.max(1, sets - 1)) * 0.75 + jitter(0.3)),
      })),
    };
  }

  function benchLift(week: number, daysAgo: number, deload: boolean, effort: number) {
    const stalled = daysAgo < 28;
    const weight = plate((60 + (stalled ? DEMO_WEEKS - 4 : week) * 1.25) * (deload ? 0.9 : 1));
    const rpe = daysAgo < 14 ? 8.75 : stalled ? 7.5 : effort;
    return lift('Barbell Bench Press', 5, 5, weight, rpe);
  }
}

function atHour(date: ISODate, hour: number): string {
  const d = parseISODate(date);
  d.setHours(hour);
  return d.toISOString();
}

export async function hasDemoData(): Promise<boolean> {
  const sessions = await db.sessions.where('_deleted').equals(0).toArray();
  return sessions.some((s) => s.notes === DEMO_NOTE);
}

/**
 * Writes the demo into the account, in one transaction. Uses the exercise
 * library by name, so it needs the library to exist; an exercise the user has
 * deleted is simply left out. Returns the number of rows written.
 */
export async function loadDemoData(todayDate: ISODate): Promise<number> {
  const demo = buildDemo(todayDate);
  return db.transaction(
    'rw',
    [db.exercises, db.sessions, db.session_exercises, db.set_entries, db.runs, db.workout_templates, db.workout_template_items, db.body_metrics],
    async () => {
      if (await hasDemoData()) throw new Error('Demo data is already loaded');
      const library = new Map<string, Local<Exercise>>();
      for (const e of await db.exercises.where('_deleted').equals(0).toArray()) library.set(e.name, e);
      if (library.size === 0) throw new Error('The exercise library is empty — sync first');

      let written = 0;
      const workoutIds = new Map<'A' | 'B', string>();
      for (const key of ['A', 'B'] as const) {
        const spec = DEMO_WORKOUTS[key];
        const template = await insertRow<WorkoutTemplate>('workout_templates', { name: spec.name, notes: DEMO_NOTE });
        workoutIds.set(key, template.id);
        written++;
        let position = 0;
        for (const name of spec.exercises) {
          const e = library.get(name);
          if (!e) continue;
          await insertRow<WorkoutTemplateItem>('workout_template_items', {
            template_id: template.id,
            exercise_id: e.id,
            position: position++,
            target_sets: e.default_sets,
            target_reps: e.default_reps,
            target_weight_kg: null,
            target_duration_s: null,
            target_distance_km: null,
            target_rpe: null,
            rest_seconds: null,
            notes: null,
          });
          written++;
        }
      }

      for (const s of demo.sessions) {
        const runExercise = s.run ? library.get(s.run.exercise) : undefined;
        const session = await insertRow<Session>('sessions', {
          date: s.date,
          kind: s.workout ? 'strength' : 'run',
          status: s.status,
          template_id: s.workout ? workoutIds.get(s.workout)! : null,
          was_planned: true,
          energy: s.energy,
          notes: DEMO_NOTE,
          started_at: s.status === 'skipped' ? null : atHour(s.date, 7),
          completed_at: atHour(s.date, 8),
        });
        written++;

        let position = 0;
        for (const l of s.lifts) {
          const e = library.get(l.exercise);
          if (!e) continue;
          const child = await insertRow<SessionExercise>('session_exercises', {
            session_id: session.id,
            exercise_id: e.id,
            position: position++,
            notes: null,
            target_sets: l.sets.length,
            target_reps: l.sets[0].reps,
            target_weight_kg: l.sets[0].weight_kg,
          });
          written++;
          for (const [i, set] of l.sets.entries()) {
            await insertRow<SetEntry>('set_entries', {
              session_exercise_id: child.id,
              set_index: i,
              reps: set.reps,
              weight_kg: set.weight_kg,
              rpe: set.rpe,
              is_warmup: false,
              notes: null,
            });
            written++;
          }
        }

        if (s.run && runExercise) {
          await insertRow<Run>('runs', {
            session_id: session.id,
            exercise_id: runExercise.id,
            run_type: runExercise.run_type ?? 'easy',
            distance_km: s.run.distance_km,
            duration_s: s.run.duration_s,
            rpe: s.run.rpe,
            avg_hr: s.run.avg_hr,
            weather: null,
            route_note: null,
          });
          written++;
        }
      }

      // One weigh-in per day: the user's own entry wins over the demo's.
      const weighed = new Set((await db.body_metrics.where('_deleted').equals(0).toArray()).map((b) => b.date));
      for (const b of demo.body) {
        if (weighed.has(b.date)) continue;
        await insertRow<BodyMetric>('body_metrics', {
          date: b.date,
          weight_kg: b.weight_kg,
          resting_hr: b.resting_hr,
          note: DEMO_NOTE,
        });
        written++;
      }
      return written;
    },
  );
}

/** Soft-deletes every demo row. Real data is never touched. Returns the number of demo sessions removed. */
export async function removeDemoData(): Promise<number> {
  return db.transaction(
    'rw',
    [db.sessions, db.session_exercises, db.set_entries, db.runs, db.run_splits, db.workout_templates, db.workout_template_items, db.body_metrics],
    async () => {
      const sessions = (await db.sessions.where('_deleted').equals(0).toArray()).filter((s) => s.notes === DEMO_NOTE);
      for (const s of sessions) await removeSession(s.id);

      const workouts = (await db.workout_templates.where('_deleted').equals(0).toArray()).filter((t) => t.notes === DEMO_NOTE);
      for (const t of workouts) await deleteWorkout(t.id);

      const body = (await db.body_metrics.where('_deleted').equals(0).toArray()).filter((b) => b.note === DEMO_NOTE);
      for (const b of body) await softDeleteRow('body_metrics', b.id);

      return sessions.length;
    },
  );
}
