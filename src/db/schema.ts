import Dexie, { type EntityTable } from 'dexie';
import type {
  BodyMetric,
  Exercise,
  Local,
  Run,
  RunSplit,
  Session,
  SessionExercise,
  SetEntry,
  SyncMeta,
  UserPrefs,
  WeekPlan,
  WeekPlanDay,
  WorkoutTemplate,
  WorkoutTemplateItem,
} from '../types/domain';

export class FitTrackerDB extends Dexie {
  exercises!: EntityTable<Local<Exercise>, 'id'>;
  workout_templates!: EntityTable<Local<WorkoutTemplate>, 'id'>;
  workout_template_items!: EntityTable<Local<WorkoutTemplateItem>, 'id'>;
  week_plans!: EntityTable<Local<WeekPlan>, 'id'>;
  week_plan_days!: EntityTable<Local<WeekPlanDay>, 'id'>;
  sessions!: EntityTable<Local<Session>, 'id'>;
  session_exercises!: EntityTable<Local<SessionExercise>, 'id'>;
  set_entries!: EntityTable<Local<SetEntry>, 'id'>;
  runs!: EntityTable<Local<Run>, 'id'>;
  run_splits!: EntityTable<Local<RunSplit>, 'id'>;
  body_metrics!: EntityTable<Local<BodyMetric>, 'id'>;
  user_prefs!: EntityTable<Local<UserPrefs>, 'id'>;
  sync_meta!: EntityTable<SyncMeta, 'table'>;

  constructor() {
    super('fit_tracker');

    // Version 1 as shipped. Never edit it: devices already hold version 1
    // databases, and Dexie upgrades them by replaying the versions in order.
    this.version(1).stores({
      exercises: 'id, _dirty, _deleted, updated_at, modality, muscle_group, sort_order',
      workout_templates: 'id, _dirty, _deleted, updated_at, name',
      workout_template_items: 'id, _dirty, _deleted, updated_at, template_id, position',
      week_plans: 'id, _dirty, _deleted, updated_at, active_from',
      week_plan_days: 'id, _dirty, _deleted, updated_at, week_plan_id, weekday',
      sessions: 'id, _dirty, _deleted, updated_at, date, status',
      session_exercises: 'id, _dirty, _deleted, updated_at, session_id, position',
      set_entries: 'id, _dirty, _deleted, updated_at, session_exercise_id, set_index',
      runs: 'id, _dirty, _deleted, updated_at, session_id',
      run_splits: 'id, _dirty, _deleted, updated_at, run_id, split_index',
      body_metrics: 'id, _dirty, _deleted, updated_at, date',
      user_prefs: 'id, _dirty, _deleted, updated_at',
      sync_meta: 'table',
    });

    // Version 2: find every logged instance of an exercise, for "last time".
    // Adding an index needs no data migration; Dexie builds it on upgrade.
    this.version(2).stores({
      session_exercises: 'id, _dirty, _deleted, updated_at, session_id, position, exercise_id',
    });
  }
}

export const db = new FitTrackerDB();

/** Table names that participate in sync. `sync_meta` is deliberately absent. */
export type SyncedTableName =
  | 'exercises'
  | 'workout_templates'
  | 'workout_template_items'
  | 'week_plans'
  | 'week_plan_days'
  | 'sessions'
  | 'session_exercises'
  | 'set_entries'
  | 'runs'
  | 'run_splits'
  | 'body_metrics'
  | 'user_prefs';
