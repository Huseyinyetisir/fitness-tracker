import { db, type SyncedTableName } from '../../db/schema';
import { TABLE_COLUMNS } from '../../sync/columns';
import { SYNCED_TABLES } from '../../sync/tables';
import type { BaseRow, ISODate, ISODateTime, UUID } from '../../types/domain';

export const BACKUP_FORMAT = 'fit-tracker-backup';
/** Raised only when the file layout changes, never for a new column: columns are checked by name. */
export const BACKUP_VERSION = 1;

/** A complete, restorable copy of the account: every table, tombstones included. */
export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: ISODateTime;
  /** The account the rows belong to. A restore into another account re-keys them — see restore.ts. */
  user_id: UUID;
  tables: Record<SyncedTableName, BaseRow[]>;
}

/** A row with exactly the table's synced columns, in column order — local-only fields dropped. */
function pickColumns(name: SyncedTableName, row: object): BaseRow {
  const source = row as Record<string, unknown>;
  return Object.fromEntries(TABLE_COLUMNS[name].map((c) => [c, source[c] ?? null])) as unknown as BaseRow;
}

export async function buildBackup(userId: UUID, exportedAt: ISODateTime = new Date().toISOString()): Promise<Backup> {
  const tables = {} as Record<SyncedTableName, BaseRow[]>;
  for (const name of SYNCED_TABLES) {
    const rows = await (db[name] as unknown as import('dexie').Table<object, string>).toArray();
    tables[name] = rows.map((r) => pickColumns(name, r));
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: exportedAt, user_id: userId, tables };
}

export function backupFileName(date: ISODate): string {
  return `fit-tracker-backup-${date}.json`;
}

export function backupRowCount(backup: Backup): number {
  return SYNCED_TABLES.reduce((n, name) => n + backup.tables[name].length, 0);
}

export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTimestamp = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/**
 * Checks a file before anything is written. Every row must carry every column
 * of its table — the server rejects a row with a missing column, and one bad
 * row would stall every later sync. Unknown tables are ignored; a missing
 * table counts as empty.
 */
export function parseBackup(text: string): ParsedBackup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not a Fit Tracker backup: it is not valid JSON.' };
  }
  if (!isObject(value) || value.format !== BACKUP_FORMAT || !Number.isInteger(value.version)) {
    return { ok: false, error: 'This file is not a Fit Tracker backup.' };
  }
  if ((value.version as number) > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of Fit Tracker. Update the app first.' };
  }
  if (typeof value.user_id !== 'string' || value.user_id === '' || !isTimestamp(value.exported_at) || !isObject(value.tables)) {
    return { ok: false, error: 'This backup is damaged: its header is incomplete.' };
  }

  const tables = {} as Record<SyncedTableName, BaseRow[]>;
  for (const name of SYNCED_TABLES) {
    const rows = value.tables[name] ?? [];
    if (!Array.isArray(rows)) return { ok: false, error: `This backup is damaged: ${name} is not a list.` };
    for (const [i, row] of rows.entries()) {
      const where = `${name}, row ${i + 1}`;
      if (!isObject(row)) return { ok: false, error: `This backup is damaged: ${where} is not a record.` };
      const missing = TABLE_COLUMNS[name].find((c) => !(c in row));
      if (missing) return { ok: false, error: `This backup is damaged: ${where} has no "${missing}".` };
      if (typeof row.id !== 'string' || row.id === '') return { ok: false, error: `This backup is damaged: ${where} has no id.` };
      if (!isTimestamp(row.created_at) || !isTimestamp(row.updated_at) || !(row.deleted_at === null || isTimestamp(row.deleted_at))) {
        return { ok: false, error: `This backup is damaged: ${where} has an invalid timestamp.` };
      }
    }
    tables[name] = rows.map((r) => pickColumns(name, r as object));
  }

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: value.version as number,
      exported_at: value.exported_at as string,
      user_id: value.user_id,
      tables,
    },
  };
}
