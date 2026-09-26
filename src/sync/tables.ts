import type { SyncedTableName } from '../db/schema';

/**
 * Foreign-key-safe order. Parents before children, so a push never inserts a
 * row whose parent has not arrived yet. Pull applies the same order for the
 * same reason. This is the single declaration — push.ts and pull.ts both
 * import it rather than hard-coding their own list.
 */
export const SYNCED_TABLES: readonly SyncedTableName[] = [
  'exercises',
  'workout_templates',
  'workout_template_items',
  'week_plans',
  'week_plan_days',
  'sessions',
  'session_exercises',
  'set_entries',
  'runs',
  'run_splits',
  'body_metrics',
  'user_prefs',
] as const;
