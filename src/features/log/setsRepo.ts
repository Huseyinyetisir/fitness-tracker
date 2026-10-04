import { db } from '../../db/schema';
import { insertRow, softDeleteRow, updateRow } from '../../db/repo';
import { isSystemTimestamp, nowISO } from '../../lib/time';
import type { Exercise, Local, Session, SessionExercise, SetEntry, UUID } from '../../types/domain';
import { validateSet, type FinishedStatus, type SetDraft } from './setRules';

function assertValid(draft: SetDraft): number {
  const messages = Object.values(validateSet(draft));
  if (messages.length > 0 || draft.rpe === null) throw new Error(messages.join('; '));
  return draft.rpe;
}

/**
 * Makes a session the user's. The first write into a materialized session —
 * a set, an added exercise, a note — gives it a real timestamp, so the plan
 * never rewrites a session the user has begun. Logging also records the start.
 */
async function claimSession(sessionId: UUID, opts: { start: boolean }): Promise<void> {
  const session = await db.sessions.get(sessionId);
  if (!session) return;
  if (opts.start && !session.started_at) {
    await updateRow<Session>('sessions', sessionId, { started_at: nowISO() });
  } else if (isSystemTimestamp(session.updated_at)) {
    await updateRow<Session>('sessions', sessionId, {});
  }
}

export async function logSet(sessionExerciseId: UUID, draft: SetDraft): Promise<Local<SetEntry>> {
  const rpe = assertValid(draft);
  return db.transaction('rw', [db.sessions, db.session_exercises, db.set_entries], async () => {
    const child = await db.session_exercises.get(sessionExerciseId);
    if (!child) throw new Error(`session_exercises: no row with id ${sessionExerciseId}`);

    // Max over every set, deleted ones included, so an index is never reused.
    const existing = await db.set_entries.where('session_exercise_id').equals(sessionExerciseId).toArray();
    const setIndex = existing.reduce((max, s) => Math.max(max, s.set_index + 1), 0);

    const row = await insertRow<SetEntry>('set_entries', {
      session_exercise_id: sessionExerciseId,
      set_index: setIndex,
      reps: draft.reps,
      weight_kg: draft.weight_kg,
      rpe,
      is_warmup: draft.is_warmup,
      notes: null,
    });
    await claimSession(child.session_id, { start: true });
    return row;
  });
}

export async function updateSet(id: UUID, draft: SetDraft): Promise<void> {
  const rpe = assertValid(draft);
  await updateRow<SetEntry>('set_entries', id, {
    reps: draft.reps,
    weight_kg: draft.weight_kg,
    rpe,
    is_warmup: draft.is_warmup,
  });
}

export async function deleteSet(id: UUID): Promise<void> {
  await softDeleteRow('set_entries', id);
}

export async function addExerciseToSession(sessionId: UUID, exercise: Exercise): Promise<Local<SessionExercise>> {
  return db.transaction('rw', [db.sessions, db.session_exercises], async () => {
    const children = (await db.session_exercises.where('session_id').equals(sessionId).toArray()).filter(
      (c) => c._deleted === 0,
    );
    const position = children.reduce((max, c) => Math.max(max, c.position + 1), 0);
    const child = await insertRow<SessionExercise>('session_exercises', {
      session_id: sessionId,
      exercise_id: exercise.id,
      position,
      notes: null,
      target_sets: exercise.default_sets,
      target_reps: exercise.default_reps,
      target_weight_kg: exercise.default_weight_kg,
    });
    await claimSession(sessionId, { start: false });
    return child;
  });
}

export async function removeExerciseFromSession(sessionExerciseId: UUID): Promise<void> {
  await db.transaction('rw', [db.sessions, db.session_exercises, db.set_entries], async () => {
    const child = await db.session_exercises.get(sessionExerciseId);
    if (!child) return;
    const sets = await db.set_entries.where('session_exercise_id').equals(sessionExerciseId).toArray();
    for (const s of sets) if (s._deleted === 0) await softDeleteRow('set_entries', s.id);
    await softDeleteRow('session_exercises', sessionExerciseId);
    await claimSession(child.session_id, { start: false });
  });
}

export async function setExerciseNote(sessionExerciseId: UUID, notes: string): Promise<void> {
  await db.transaction('rw', [db.sessions, db.session_exercises], async () => {
    const child = await updateRow<SessionExercise>('session_exercises', sessionExerciseId, {
      notes: notes.trim() || null,
    });
    await claimSession(child.session_id, { start: false });
  });
}

export async function finishSession(
  sessionId: UUID,
  outcome: { status: FinishedStatus; energy: number | null; notes: string | null },
): Promise<void> {
  const session = await db.sessions.get(sessionId);
  if (!session) throw new Error(`sessions: no row with id ${sessionId}`);
  const now = nowISO();
  await updateRow<Session>('sessions', sessionId, {
    status: outcome.status,
    energy: outcome.energy,
    notes: outcome.notes,
    completed_at: now,
    started_at: session.started_at ?? now,
  });
}
