export type UUID = string;
/** 'YYYY-MM-DD' */
export type ISODate = string;
/** ISO 8601 UTC, e.g. '2026-09-22T06:30:00.000Z' */
export type ISODateTime = string;

/** Columns present on every synced row. */
export interface BaseRow {
  id: UUID;
  user_id: UUID | null;
  created_at: ISODateTime;
  /** Client-set. The last-write-wins comparand. */
  updated_at: ISODateTime;
  /** Server trigger-set. Used only as the pull watermark. Null until first push. */
  server_updated_at: ISODateTime | null;
  /** Soft delete. The app never hard-deletes during normal operation. */
  deleted_at: ISODateTime | null;
}

/**
 * Local-only sync flag. Dexie cannot index booleans, so this is 0 | 1
 * rather than false | true. It is stripped before pushing to Supabase.
 */
export interface LocalMeta {
  _dirty: 0 | 1;
}

export type Local<T> = T & LocalMeta;

export type Modality = 'strength' | 'cardio';
export type RunType = 'easy' | 'tempo' | 'intervals' | 'long';
export type SessionKind = 'strength' | 'run' | 'mixed';
export type SessionStatus = 'planned' | 'done' | 'partial' | 'skipped';
/** 1 = Monday … 7 = Sunday */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Exercise extends BaseRow {
  name: string;
  muscle_group: string | null;
  modality: Modality;
  run_type: RunType | null;
  default_sets: number | null;
  default_reps: number | null;
  default_weight_kg: number | null;
  default_duration_s: number | null;
  default_distance_km: number | null;
  sort_order: number;
}

export interface WorkoutTemplate extends BaseRow {
  name: string;
  notes: string | null;
}

export interface WorkoutTemplateItem extends BaseRow {
  template_id: UUID;
  exercise_id: UUID;
  position: number;
  target_sets: number | null;
  target_reps: number | null;
  target_weight_kg: number | null;
  target_duration_s: number | null;
  target_distance_km: number | null;
  target_rpe: number | null;
  rest_seconds: number | null;
  notes: string | null;
}

export interface WeekPlan extends BaseRow {
  name: string;
  active_from: ISODate;
}

export interface WeekPlanDay extends BaseRow {
  week_plan_id: UUID;
  weekday: Weekday;
  /** null = rest day */
  template_id: UUID | null;
}

export interface Session extends BaseRow {
  date: ISODate;
  kind: SessionKind;
  status: SessionStatus;
  template_id: UUID | null;
  was_planned: boolean;
  energy: number | null;
  notes: string | null;
  started_at: ISODateTime | null;
  completed_at: ISODateTime | null;
}

export interface SessionExercise extends BaseRow {
  session_id: UUID;
  exercise_id: UUID;
  position: number;
  notes: string | null;
  target_sets: number | null;
  target_reps: number | null;
  target_weight_kg: number | null;
}

export interface SetEntry extends BaseRow {
  session_exercise_id: UUID;
  set_index: number;
  reps: number;
  weight_kg: number;
  /** Required, 1–10, half steps allowed. */
  rpe: number;
  is_warmup: boolean;
  notes: string | null;
}

export interface Run extends BaseRow {
  session_id: UUID;
  exercise_id: UUID;
  run_type: RunType;
  distance_km: number;
  duration_s: number;
  /** Required, 1–10. */
  rpe: number;
  avg_hr: number | null;
  weather: string | null;
  route_note: string | null;
}

export interface RunSplit extends BaseRow {
  run_id: UUID;
  split_index: number;
  distance_km: number;
  duration_s: number;
}

export interface BodyMetric extends BaseRow {
  date: ISODate;
  weight_kg: number | null;
  resting_hr: number | null;
  note: string | null;
}

export interface UserPrefs extends BaseRow {
  rest_seconds_default: number;
  vibration: boolean;
  theme: string;
}

/** Local-only. Never pushed. */
export interface SyncMeta {
  table: string;
  watermark: ISODateTime | null;
  last_synced_at: ISODateTime | null;
  last_error: string | null;
}
