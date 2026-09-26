import type { BaseRow, ISODateTime, Local, UUID } from '../types/domain';
import { newId } from '../lib/id';
import { nowISO } from '../lib/time';
import { db, type SyncedTableName } from './schema';

type Insertable<T extends BaseRow> = Omit<T, keyof BaseRow>;

function table(name: SyncedTableName) {
  // Dexie's generated table properties are typed per-entity; the sync layer
  // needs them addressed by name, so this is the single cast point.
  return db[name] as unknown as import('dexie').Table<Local<BaseRow>, UUID>;
}

/** Inserts a row, stamping identity, timestamps, and the dirty flag. */
export async function insertRow<T extends BaseRow>(
  name: SyncedTableName,
  data: Insertable<T>,
): Promise<Local<T>> {
  const ts = nowISO();
  const row = {
    ...data,
    id: newId(),
    user_id: null,
    created_at: ts,
    updated_at: ts,
    server_updated_at: null,
    deleted_at: null,
    _dirty: 1 as const,
  } as Local<T>;

  await table(name).put(row as Local<BaseRow>);
  return row;
}

/** Applies a patch, advancing updated_at and re-marking the row dirty. */
export async function updateRow<T extends BaseRow>(
  name: SyncedTableName,
  id: UUID,
  patch: Partial<Omit<T, keyof BaseRow>>,
): Promise<Local<T>> {
  const existing = (await table(name).get(id)) as Local<T> | undefined;
  if (!existing) throw new Error(`${name}: no row with id ${id}`);

  const row = {
    ...existing,
    ...patch,
    updated_at: nowISO(),
    _dirty: 1 as const,
  } as Local<T>;

  await table(name).put(row as Local<BaseRow>);
  return row;
}

/** Soft delete. The row stays so its tombstone can propagate. */
export async function softDeleteRow(name: SyncedTableName, id: UUID): Promise<void> {
  const existing = await table(name).get(id);
  if (!existing) return;

  await table(name).put({
    ...existing,
    deleted_at: nowISO(),
    updated_at: nowISO(),
    _dirty: 1,
  });
}

export async function dirtyRows(name: SyncedTableName): Promise<Local<BaseRow>[]> {
  return table(name).where('_dirty').equals(1).toArray();
}

/**
 * Clears the dirty flag only for rows that still carry the `updated_at` that
 * was uploaded. A write landing during the push's network round trip bumps
 * `updated_at`; clearing that row unconditionally would mark an unsent edit
 * as synced and it would never be pushed again.
 */
export async function clearDirty(
  name: SyncedTableName,
  rows: { id: UUID; updated_at: ISODateTime }[],
): Promise<void> {
  await db.transaction('rw', table(name), async () => {
    for (const { id, updated_at } of rows) {
      const current = await table(name).get(id);
      if (current && current.updated_at === updated_at) {
        await table(name).update(id, { _dirty: 0 });
      }
    }
  });
}
