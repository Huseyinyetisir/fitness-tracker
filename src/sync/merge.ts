import type { BaseRow, ISODateTime, Local } from '../types/domain';

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
 *
 * Timestamps are compared as instants, not strings — see `instant()` below.
 */

/**
 * Timestamps arrive in two renderings: the client writes Date#toISOString
 * ('…00.000Z') while PostgREST returns '…00+00:00', dropping a zero fraction
 * and using an offset rather than Z. Those strings do not sort against each
 * other, so the same instant compared as text resolves as local-newer and the
 * documented tie rule never fires. Compare epoch milliseconds instead.
 */
function instant(ts: ISODateTime): number {
  return Date.parse(ts);
}

/** A row taken from remote, with correct local index fields attached. */
function fromRemote<T extends BaseRow>(remoteRow: T): Local<T> {
  return {
    ...remoteRow,
    _dirty: 0,
    _deleted: remoteRow.deleted_at ? 1 : 0,
  } as Local<T>;
}

export function mergeRow<T extends BaseRow>(
  localRow: Local<T> | undefined,
  remoteRow: T | undefined,
): Local<T> | undefined {
  if (!localRow && !remoteRow) return undefined;
  if (!localRow) return fromRemote(remoteRow as T);
  if (!remoteRow) return localRow;

  if (instant(remoteRow.updated_at) >= instant(localRow.updated_at)) {
    return fromRemote(remoteRow);
  }

  // Local wins, so the server is behind and needs this row. Re-queue it:
  // returning it untouched would leave a clean row permanently newer than
  // the server, and no later sync would ever push it.
  return localRow._dirty === 1
    ? localRow
    : { ...localRow, _dirty: 1, _deleted: localRow.deleted_at ? 1 : 0 };
}
