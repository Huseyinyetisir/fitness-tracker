import type { BaseRow, Local } from '../types/domain';

/**
 * Row-level last-write-wins, comparing the client-owned `updated_at`.
 *
 * A tie resolves to the remote row. That matters: resolving ties to the local
 * row would leave it dirty forever, so every sync would re-push the same row
 * and never converge.
 *
 * Tombstones need no special case — a soft-deleted row is an ordinary update
 * with `deleted_at` set, so the same comparison carries it in either
 * direction.
 */
export function mergeRow<T extends BaseRow>(
  localRow: Local<T> | undefined,
  remoteRow: T | undefined,
): Local<T> | undefined {
  if (!localRow && !remoteRow) return undefined;
  if (!localRow) return { ...(remoteRow as T), _dirty: 0 } as Local<T>;
  if (!remoteRow) return localRow;

  if (remoteRow.updated_at >= localRow.updated_at) {
    return { ...remoteRow, _dirty: 0 } as Local<T>;
  }

  return localRow;
}
