import { db } from '../../db/schema';
import { meanRPE } from '../../lib/rpe';
import { isWorkingSet, totalVolume } from '../../lib/strength';
import type {
  Exercise,
  ISODate,
  Local,
  Run,
  Session,
  SessionExercise,
  SetEntry,
  WorkoutTemplate,
} from '../../types/domain';

/** Everything a list row needs to describe one session. */
export interface SessionCard {
  session: Local<Session>;
  title: string;
  workingSets: number;
  /** Sum of target sets over the strength exercises. */
  targetSets: number;
  volumeKg: number;
  avgRpe: number | null;
  run: Local<Run> | null;
}

export function sessionTitle(session: Session, templateName: string | undefined, runName: string | undefined): string {
  if (templateName) return templateName;
  if (session.kind === 'run') return runName ?? 'Run';
  return session.was_planned ? 'Workout' : 'Unplanned workout';
}

/**
 * The planned session for a workout among one day's sessions, if any — so
 * logging the workout already planned for today opens that session instead
 * of creating a second one beside it. An empty workout never matches.
 */
export function plannedSessionFor<S extends Pick<Session, 'template_id' | 'status'>>(
  sessions: S[],
  templateId: Session['template_id'],
): S | undefined {
  if (templateId === null) return undefined;
  return sessions.find((s) => s.template_id === templateId && s.status === 'planned');
}

export function buildCards(input: {
  sessions: Local<Session>[];
  children: SessionExercise[];
  sets: SetEntry[];
  runs: Local<Run>[];
  templates: WorkoutTemplate[];
  exercises: Exercise[];
}): SessionCard[] {
  const templateName = new Map(input.templates.map((t) => [t.id, t.name]));
  const exerciseById = new Map(input.exercises.map((e) => [e.id, e]));
  const isCardio = (exerciseId: string) => exerciseById.get(exerciseId)?.modality === 'cardio';

  return input.sessions
    .filter((s) => s.deleted_at === null)
    .map((session) => {
      const children = input.children.filter((c) => c.session_id === session.id && c.deleted_at === null);
      const childIds = new Set(children.map((c) => c.id));
      const sets = input.sets.filter((s) => childIds.has(s.session_exercise_id) && isWorkingSet(s));
      const run = input.runs.find((r) => r.session_id === session.id && r.deleted_at === null) ?? null;
      const runExerciseId = run?.exercise_id ?? children.find((c) => isCardio(c.exercise_id))?.exercise_id;

      return {
        session,
        title: sessionTitle(
          session,
          session.template_id ? templateName.get(session.template_id) : undefined,
          runExerciseId ? exerciseById.get(runExerciseId)?.name : undefined,
        ),
        workingSets: sets.length,
        targetSets: children
          .filter((c) => !isCardio(c.exercise_id))
          .reduce((n, c) => n + (c.target_sets ?? 0), 0),
        volumeKg: totalVolume(sets),
        avgRpe: sets.length > 0 ? meanRPE(sets) : run ? run.rpe : null,
        run,
      };
    })
    .sort(
      (a, b) =>
        a.session.date.localeCompare(b.session.date) || a.session.created_at.localeCompare(b.session.created_at),
    );
}

/** Cards for every live session between two dates, inclusive. Safe inside useLiveQuery. */
export async function loadSessionCards(start: ISODate, end: ISODate): Promise<SessionCard[]> {
  const sessions = (await db.sessions.where('date').between(start, end, true, true).toArray()).filter(
    (s) => s._deleted === 0,
  );
  if (sessions.length === 0) return [];

  const ids = sessions.map((s) => s.id);
  const children = (await db.session_exercises.where('session_id').anyOf(ids).toArray()).filter(
    (c) => c._deleted === 0,
  );
  const sets =
    children.length > 0
      ? await db.set_entries.where('session_exercise_id').anyOf(children.map((c) => c.id)).toArray()
      : [];
  const runs = await db.runs.where('session_id').anyOf(ids).toArray();
  const templates = await db.workout_templates.toArray();
  const exercises = await db.exercises.toArray();

  return buildCards({ sessions, children, sets, runs, templates, exercises });
}
