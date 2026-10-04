import type { SyncedTableName } from '../db/schema';
import type {
  BodyMetric,
  Exercise,
  Run,
  RunSplit,
  Session,
  SessionExercise,
  SetEntry,
  UserPrefs,
  WeekPlan,
  WeekPlanDay,
  WorkoutTemplate,
  WorkoutTemplateItem,
} from '../types/domain';

/**
 * Lists every column of T, and fails to compile if one is missing — so a
 * column added to a domain type cannot silently drop out of backups.
 */
function columns<T>() {
  return <const K extends readonly (keyof T & string)[]>(
    keys: [Exclude<keyof T, K[number]>] extends [never] ? K : { missing: Exclude<keyof T, K[number]> },
  ): readonly string[] => keys as readonly string[];
}

const BASE = ['id', 'user_id', 'created_at', 'updated_at', 'server_updated_at', 'deleted_at'] as const;

/** Every synced column of every table, in a stable order. Local-only fields are not columns. */
export const TABLE_COLUMNS: Record<SyncedTableName, readonly string[]> = {
  exercises: columns<Exercise>()([
    ...BASE,
    'name',
    'muscle_group',
    'modality',
    'run_type',
    'default_sets',
    'default_reps',
    'default_weight_kg',
    'default_duration_s',
    'default_distance_km',
    'sort_order',
  ]),
  workout_templates: columns<WorkoutTemplate>()([...BASE, 'name', 'notes']),
  workout_template_items: columns<WorkoutTemplateItem>()([
    ...BASE,
    'template_id',
    'exercise_id',
    'position',
    'target_sets',
    'target_reps',
    'target_weight_kg',
    'target_duration_s',
    'target_distance_km',
    'target_rpe',
    'rest_seconds',
    'notes',
  ]),
  week_plans: columns<WeekPlan>()([...BASE, 'name', 'active_from']),
  week_plan_days: columns<WeekPlanDay>()([...BASE, 'week_plan_id', 'weekday', 'template_id']),
  sessions: columns<Session>()([
    ...BASE,
    'date',
    'kind',
    'status',
    'template_id',
    'was_planned',
    'energy',
    'notes',
    'started_at',
    'completed_at',
  ]),
  session_exercises: columns<SessionExercise>()([
    ...BASE,
    'session_id',
    'exercise_id',
    'position',
    'notes',
    'target_sets',
    'target_reps',
    'target_weight_kg',
  ]),
  set_entries: columns<SetEntry>()([
    ...BASE,
    'session_exercise_id',
    'set_index',
    'reps',
    'weight_kg',
    'rpe',
    'is_warmup',
    'notes',
  ]),
  runs: columns<Run>()([
    ...BASE,
    'session_id',
    'exercise_id',
    'run_type',
    'distance_km',
    'duration_s',
    'rpe',
    'avg_hr',
    'weather',
    'route_note',
  ]),
  run_splits: columns<RunSplit>()([...BASE, 'run_id', 'split_index', 'distance_km', 'duration_s']),
  body_metrics: columns<BodyMetric>()([...BASE, 'date', 'weight_kg', 'resting_hr', 'note']),
  user_prefs: columns<UserPrefs>()([...BASE, 'rest_seconds_default', 'vibration', 'theme']),
};
