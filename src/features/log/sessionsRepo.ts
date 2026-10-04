import { db } from '../../db/schema';
import { insertRow, softDeleteRow } from '../../db/repo';
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
