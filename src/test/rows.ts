import type {
  BodyMetric,
  Exercise,
  Local,
  Run,
  Session,
  SessionExercise,
  SetEntry,
} from '../types/domain';
import { base } from './fixtures';

/**
 * Plain rows for pure tests — no database involved. Each takes an id and
 * overrides; the defaults describe a finished strength session on Monday
 * 5 October 2026 with 5 × 100 kg at RPE 8.
 */

export function sessionRow(id: string, extra: Partial<Session> = {}): Local<Session> {
  return {
    ...base(id, { deleted_at: extra.deleted_at ?? null }),
    date: '2026-10-05',
    kind: 'strength',
    status: 'done',
    template_id: null,
    was_planned: true,
    energy: null,
    notes: null,
    started_at: null,
    completed_at: null,
    ...extra,
  };
}

export function childRow(id: string, sessionId: string, exerciseId: string, extra: Partial<SessionExercise> = {}): Local<SessionExercise> {
  return {
    ...base(id, { deleted_at: extra.deleted_at ?? null }),
    session_id: sessionId,
    exercise_id: exerciseId,
    position: 0,
    notes: null,
    target_sets: 3,
    target_reps: 5,
    target_weight_kg: 100,
    ...extra,
  };
}

export function setRow(id: string, childId: string, extra: Partial<SetEntry> = {}): Local<SetEntry> {
  return {
    ...base(id, { deleted_at: extra.deleted_at ?? null }),
    session_exercise_id: childId,
    set_index: 0,
    reps: 5,
    weight_kg: 100,
    rpe: 8,
    is_warmup: false,
    notes: null,
    ...extra,
  };
}

export function runRow(id: string, sessionId: string, extra: Partial<Run> = {}): Local<Run> {
  return {
    ...base(id, { deleted_at: extra.deleted_at ?? null }),
    session_id: sessionId,
    exercise_id: 'easy-run',
    run_type: 'easy',
    distance_km: 5,
    duration_s: 1800,
    rpe: 6,
    avg_hr: null,
    weather: null,
    route_note: null,
    ...extra,
  };
}

export function exerciseRow(id: string, name: string, extra: Partial<Exercise> = {}): Local<Exercise> {
  const cardio = extra.modality === 'cardio';
  return {
    ...base(id, { deleted_at: extra.deleted_at ?? null }),
    name,
    muscle_group: cardio ? 'cardio' : 'legs',
    modality: 'strength',
    run_type: null,
    default_sets: null,
    default_reps: null,
    default_weight_kg: null,
    default_duration_s: null,
    default_distance_km: null,
    sort_order: 0,
    ...extra,
  };
}

export function bodyRow(id: string, date: string, extra: Partial<BodyMetric> = {}): Local<BodyMetric> {
  return {
    ...base(id, { deleted_at: extra.deleted_at ?? null }),
    date,
    weight_kg: null,
    resting_hr: null,
    note: null,
    ...extra,
  };
}
