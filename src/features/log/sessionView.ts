import { db } from '../../db/schema';
import type {
  Exercise,
  ISODate,
  Local,
  Run,
  Session,
  SessionExercise,
  SetEntry,
  UUID,
  WorkoutTemplateItem,
} from '../../types/domain';
import { sessionTitle } from './cards';
import { lastTimeSets } from './prefill';

export interface ExerciseBlock {
  child: Local<SessionExercise>;
  exercise: Local<Exercise> | undefined;
  /** Live sets, in set order. */
  sets: Local<SetEntry>[];
}

export interface SessionView {
  session: Local<Session>;
  title: string;
  blocks: ExerciseBlock[];
  run: Local<Run> | null;
  /** The workout's items, for rest times and run targets. Empty for an unplanned session. */
  templateItems: Local<WorkoutTemplateItem>[];
}

/** One session with everything its logging screen needs. Null once removed. Safe inside useLiveQuery. */
export async function loadSessionView(sessionId: UUID): Promise<SessionView | null> {
  const session = await db.sessions.get(sessionId);
  if (!session || session._deleted === 1) return null;

  const children = (await db.session_exercises.where('session_id').equals(sessionId).toArray())
    .filter((c) => c._deleted === 0)
    .sort((a, b) => a.position - b.position);
  const exerciseById = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
  const sets =
    children.length > 0
      ? (await db.set_entries.where('session_exercise_id').anyOf(children.map((c) => c.id)).toArray()).filter(
          (s) => s._deleted === 0,
        )
      : [];
  const run = (await db.runs.where('session_id').equals(sessionId).toArray()).find((r) => r._deleted === 0) ?? null;
  const template = session.template_id ? await db.workout_templates.get(session.template_id) : undefined;
  const templateItems = session.template_id
    ? (await db.workout_template_items.where('template_id').equals(session.template_id).toArray()).filter(
        (i) => i._deleted === 0,
      )
    : [];

  const runExerciseId =
    run?.exercise_id ?? children.find((c) => exerciseById.get(c.exercise_id)?.modality === 'cardio')?.exercise_id;

  return {
    session,
    title: sessionTitle(session, template?.name, runExerciseId ? exerciseById.get(runExerciseId)?.name : undefined),
    blocks: children.map((child) => ({
      child,
      exercise: exerciseById.get(child.exercise_id),
      sets: sets.filter((s) => s.session_exercise_id === child.id).sort((a, b) => a.set_index - b.set_index),
    })),
    run,
    templateItems,
  };
}

/** Last time's working sets for an exercise, for pre-filling. Safe inside useLiveQuery. */
export async function loadLastTime(exerciseId: UUID, sessionId: UUID, date: ISODate): Promise<Local<SetEntry>[]> {
  const children = await db.session_exercises.where('exercise_id').equals(exerciseId).toArray();
  if (children.length === 0) return [];
  const sessionIds = [...new Set(children.map((c) => c.session_id))];
  const sessions = (await db.sessions.bulkGet(sessionIds)).filter((s): s is Local<Session> => s !== undefined);
  const sets = await db.set_entries.where('session_exercise_id').anyOf(children.map((c) => c.id)).toArray();
  return lastTimeSets({
    exerciseId,
    currentSessionId: sessionId,
    currentDate: date,
    sessions,
    sessionExercises: children,
    sets,
  });
}
