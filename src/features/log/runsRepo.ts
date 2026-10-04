import { db } from '../../db/schema';
import { insertRow, softDeleteRow, updateRow } from '../../db/repo';
import { nowISO } from '../../lib/time';
import type { ISODate, Run, RunSplit, Session, UUID } from '../../types/domain';
import { filledSplits, parseDuration, validateRun, type RunDraft } from './runRules';

/**
 * Saves a run. With no session it creates a finished, unplanned run session;
 * otherwise it logs into the given one — a planned run, or the run inside a
 * mixed session. Saving again updates the same run and replaces its splits.
 * Returns the session id.
 */
export async function saveRun(args: {
  sessionId: UUID | null;
  date: ISODate;
  exerciseId: UUID;
  draft: RunDraft;
}): Promise<UUID> {
  const { draft } = args;
  const messages = Object.values(validateRun(draft));
  if (messages.length > 0) throw new Error(messages.join('; '));

  return db.transaction('rw', [db.sessions, db.runs, db.run_splits, db.exercises], async () => {
    const exercise = await db.exercises.get(args.exerciseId);

    let sessionId = args.sessionId;
    if (!sessionId) {
      const now = nowISO();
      const session = await insertRow<Session>('sessions', {
        date: args.date,
        kind: 'run',
        status: 'done',
        template_id: null,
        was_planned: false,
        energy: null,
        notes: null,
        started_at: now,
        completed_at: now,
      });
      sessionId = session.id;
    }

    const fields = {
      exercise_id: args.exerciseId,
      run_type: exercise?.run_type ?? ('easy' as const),
      distance_km: draft.distance ?? 0,
      duration_s: parseDuration(draft.duration) ?? 0,
      rpe: draft.rpe ?? 0,
      avg_hr: draft.avgHr,
      weather: draft.weather.trim() || null,
      route_note: draft.routeNote.trim() || null,
    };
    const existing = (await db.runs.where('session_id').equals(sessionId).toArray()).find((r) => r._deleted === 0);
    const run = existing
      ? await updateRow<Run>('runs', existing.id, fields)
      : await insertRow<Run>('runs', { session_id: sessionId, ...fields });

    for (const old of await db.run_splits.where('run_id').equals(run.id).toArray()) {
      if (old._deleted === 0) await softDeleteRow('run_splits', old.id);
    }
    let splitIndex = 0;
    for (const split of filledSplits(draft)) {
      await insertRow<RunSplit>('run_splits', {
        run_id: run.id,
        split_index: splitIndex++,
        distance_km: split.distance ?? 0,
        duration_s: parseDuration(split.duration) ?? 0,
      });
    }

    return sessionId;
  });
}
