import { db } from '../../db/schema';
import { insertRow, softDeleteRow, updateRow } from '../../db/repo';
import { isSystemTimestamp, nowISO } from '../../lib/time';
import type { ISODate, Local, Session, SessionExercise, UUID } from '../../types/domain';
import { sessionKindFor } from '../plan/materialize';

/**
 * A session the user asked for: an unplanned workout from Today, or a session
 * added to a day in the week view. Unlike materialized sessions these get a
 * random id and a real timestamp — they are the user's from the start.
 */
export async function createSessionFromTemplate(
  date: ISODate,
  templateId: UUID | null,
  opts: { wasPlanned: boolean },
): Promise<Local<Session>> {
  return db.transaction(
    'rw',
    [db.sessions, db.session_exercises, db.workout_template_items, db.exercises],
    async () => {
      const items = templateId
        ? (await db.workout_template_items.where('template_id').equals(templateId).toArray())
            .filter((i) => i._deleted === 0)
            .sort((a, b) => a.position - b.position)
        : [];
      const exercises = await db.exercises.toArray();
      const kind = sessionKindFor(
        items.map((i) => exercises.find((e) => e.id === i.exercise_id)?.modality ?? 'strength'),
      );

      const session = await insertRow<Session>('sessions', {
        date,
        kind,
        status: 'planned',
        template_id: templateId,
        was_planned: opts.wasPlanned,
        energy: null,
        notes: null,
        started_at: null,
        completed_at: null,
      });

      for (const item of items) {
        await insertRow<SessionExercise>('session_exercises', {
          session_id: session.id,
          exercise_id: item.exercise_id,
          position: item.position,
          notes: null,
          target_sets: item.target_sets,
          target_reps: item.target_reps,
          target_weight_kg: item.target_weight_kg,
        });
      }
      return session;
    },
  );
}

/**
 * Makes a session the user's. The first write into a materialized session —
 * a set, an exercise, a note, a run, a finish — gives it a real timestamp, so
 * the plan never rewrites it again. Logging also records the start.
 *
 * Ownership has to reach the session's exercises too. A device that has not
 * yet seen this claim may still rewrite the session from the plan: the server
 * rejects that for the session row, but would accept it for exercises still
 * carrying a system stamp — deleting or replacing exactly the ones logged into.
 *
 * Call it inside a transaction that includes db.sessions and db.session_exercises.
 */
export async function claimSession(sessionId: UUID, opts: { start: boolean }): Promise<void> {
  const session = await db.sessions.get(sessionId);
  if (!session) return;
  if (opts.start && !session.started_at) {
    await updateRow<Session>('sessions', sessionId, { started_at: nowISO() });
  } else if (isSystemTimestamp(session.updated_at)) {
    await updateRow<Session>('sessions', sessionId, {});
  }
  const children = await db.session_exercises.where('session_id').equals(sessionId).toArray();
  for (const child of children) {
    if (child._deleted === 0 && isSystemTimestamp(child.updated_at)) {
      await updateRow<SessionExercise>('session_exercises', child.id, {});
    }
  }
}

/** Soft-deletes a session and everything logged under it. A user action, so never revived. */
export async function removeSession(sessionId: UUID): Promise<void> {
  await db.transaction(
    'rw',
    [db.sessions, db.session_exercises, db.set_entries, db.runs, db.run_splits],
    async () => {
      const children = await db.session_exercises.where('session_id').equals(sessionId).toArray();
      for (const c of children.filter((x) => x._deleted === 0)) {
        const sets = await db.set_entries.where('session_exercise_id').equals(c.id).toArray();
        for (const s of sets) if (s._deleted === 0) await softDeleteRow('set_entries', s.id);
        await softDeleteRow('session_exercises', c.id);
      }

      const runs = await db.runs.where('session_id').equals(sessionId).toArray();
      for (const r of runs.filter((x) => x._deleted === 0)) {
        const splits = await db.run_splits.where('run_id').equals(r.id).toArray();
        for (const sp of splits) if (sp._deleted === 0) await softDeleteRow('run_splits', sp.id);
        await softDeleteRow('runs', r.id);
      }

      await softDeleteRow('sessions', sessionId);
    },
  );
}
