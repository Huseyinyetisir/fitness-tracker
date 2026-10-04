import { softDeleteRow } from '../../db/repo';
import { db, type SyncedTableName } from '../../db/schema';
import { newId } from '../../lib/id';
import { isSystemTimestamp } from '../../lib/time';
import { deterministicId } from '../../lib/uuidv5';
import { SYNCED_TABLES } from '../../sync/tables';
import type { BaseRow, Exercise, ISODate, Local, Session, UUID, Weekday } from '../../types/domain';
import { plannedSessionId } from '../plan/materialize';
import { defaultPlanDayId, defaultPlanId, WEEKDAYS } from '../plan/planRepo';
import { prefsId } from './prefsRepo';
import type { Backup } from './backup';

/**
 * Importing applies the sync rule: the newer `updated_at` wins. An older
 * export therefore cannot overwrite anything edited since. An imported row
 * that wins is news the server has not seen, so it is queued for push —
 * unlike a pulled row. Returns null when the local row stays as it is.
 */
export function mergeImported<T extends BaseRow>(local: Local<T> | undefined, imported: T): Local<T> | null {
  if (local && Date.parse(imported.updated_at) <= Date.parse(local.updated_at)) return null;
  return { ...imported, _dirty: 1, _deleted: imported.deleted_at ? 1 : 0 } as Local<T>;
}

export interface ImportResult {
  added: number;
  updated: number;
  unchanged: number;
}

/** Merges every row of a backup into this device, in one transaction. Sync then pushes what changed. */
export async function importBackup(backup: Backup): Promise<ImportResult> {
  const result: ImportResult = { added: 0, updated: 0, unchanged: 0 };
  const tables = SYNCED_TABLES.map((name) => db[name]);
  await db.transaction('rw', tables, async () => {
    await retireDuplicateExercises(backup.tables.exercises as Exercise[]);
    for (const name of SYNCED_TABLES) {
      const table = db[name] as unknown as import('dexie').Table<Local<BaseRow>, UUID>;
      for (const row of backup.tables[name]) {
        const local = await table.get(row.id);
        const merged = mergeImported(local, row);
        if (!merged) result.unchanged++;
        else {
          await table.put(merged);
          if (local) result.updated++;
          else result.added++;
        }
      }
    }
  });
  return result;
}

const nameKey = (name: string) => name.trim().toLowerCase();

/**
 * After "Delete all", the first sync seeds a fresh library under new ids; a
 * backup of the same account then brings its own copy of every exercise, and
 * the library would hold each one twice. A fresh exercise is retired in favour
 * of the backup's one with the same name — a normal soft delete, so it leaves
 * the server too — but only while nothing here uses it.
 */
async function retireDuplicateExercises(imported: Exercise[]): Promise<void> {
  const importedIds = new Set(imported.map((e) => e.id));
  const importedNames = new Set(imported.filter((e) => !e.deleted_at).map((e) => nameKey(e.name)));
  const used = new Set<UUID>([
    ...(await db.workout_template_items.toArray()).map((r) => r.exercise_id),
    ...(await db.session_exercises.toArray()).map((r) => r.exercise_id),
    ...(await db.runs.toArray()).map((r) => r.exercise_id),
  ]);
  const duplicates = (await db.exercises.where('_deleted').equals(0).toArray()).filter(
    (e) => importedNames.has(nameKey(e.name)) && !importedIds.has(e.id) && !used.has(e.id),
  );
  for (const e of duplicates) await softDeleteRow('exercises', e.id);
}

/** Columns that hold another row's id. */
const REFERENCES = ['template_id', 'exercise_id', 'week_plan_id', 'session_id', 'session_exercise_id', 'run_id'] as const;

/**
 * Re-keys a backup made under another account — say, after moving to a new
 * Supabase project — so it can be restored into this one.
 *
 * - Every row gets a new id. Ids are global in the database, so rows still
 *   present under the old account would otherwise collide with these.
 * - Rows every device derives by name — preferences, the default plan and its
 *   days, planned sessions — get the id this account derives, or this
 *   device would create a second copy beside each one.
 * - Untouched planned sessions from today on are dropped: they are only the
 *   plan, and this account will materialize them itself.
 * - References follow the new ids; ownership and sync state are cleared.
 */
export function forAccount(backup: Backup, userId: UUID, todayDate: ISODate): Backup {
  const old = backup.user_id;
  const derived = new Map<UUID, UUID>([
    [deterministicId(`${old}:user_prefs`), prefsId(userId)],
    [defaultPlanId(old), defaultPlanId(userId)],
    ...WEEKDAYS.map((d: Weekday) => [defaultPlanDayId(old, d), defaultPlanDayId(userId, d)] as [UUID, UUID]),
  ]);
  for (const s of backup.tables.sessions as Session[]) {
    if (s.id === plannedSessionId(old, s.date)) derived.set(s.id, plannedSessionId(userId, s.date));
  }

  const withWork = new Set<UUID>([
    ...(backup.tables.runs as unknown as { session_id: UUID }[]).map((r) => r.session_id),
    ...setSessionIds(backup),
  ]);
  const dropped = new Set(
    (backup.tables.sessions as Session[])
      .filter((s) => s.date >= todayDate && isSystemTimestamp(s.updated_at) && !withWork.has(s.id))
      .map((s) => s.id),
  );
  const keep = (name: SyncedTableName, row: BaseRow) => {
    const r = row as unknown as Record<string, unknown>;
    if (name === 'sessions') return !dropped.has(row.id);
    if (name === 'session_exercises') return !dropped.has(r.session_id as UUID);
    return true;
  };

  const ids = new Map<UUID, UUID>();
  for (const name of SYNCED_TABLES) {
    for (const row of backup.tables[name]) ids.set(row.id, derived.get(row.id) ?? newId());
  }

  const tables = {} as Record<SyncedTableName, BaseRow[]>;
  for (const name of SYNCED_TABLES) {
    tables[name] = backup.tables[name]
      .filter((row) => keep(name, row))
      .map((row) => {
        const out: Record<string, unknown> = { ...row, id: ids.get(row.id), user_id: null, server_updated_at: null };
        for (const ref of REFERENCES) {
          const value = out[ref];
          if (typeof value === 'string' && ids.has(value)) out[ref] = ids.get(value);
        }
        return out as unknown as BaseRow;
      });
  }
  return { ...backup, user_id: userId, tables };
}

function setSessionIds(backup: Backup): UUID[] {
  const sessionOfChild = new Map(
    (backup.tables.session_exercises as unknown as { id: UUID; session_id: UUID }[]).map((c) => [c.id, c.session_id]),
  );
  return (backup.tables.set_entries as unknown as { session_exercise_id: UUID }[]).flatMap((s) => {
    const session = sessionOfChild.get(s.session_exercise_id);
    return session ? [session] : [];
  });
}
