import type { SyncStatus } from './types';

/** What browsers say when a request never reached the server. */
const NETWORK_FAILURE = /failed to fetch|networkerror|network request failed|load failed/i;

export function syncLabel(status: SyncStatus | null, busy: boolean, online: boolean): string {
  const pending = status?.pendingCount ?? 0;
  const networkDown = !online || (status?.error ? NETWORK_FAILURE.test(status.error) : false);

  if (busy) return 'Syncing…';
  if (networkDown) {
    if (pending > 0) return `Offline · ${pending} pending`;
    return online ? 'Offline · will retry' : 'Offline';
  }
  if (status?.error) return `Sync error: ${status.error}`;
  if (pending > 0) return `${pending} pending`;
  if (status?.lastSyncedAt) {
    const time = new Date(status.lastSyncedAt).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `Synced ${time}`;
  }
  return 'Not synced yet';
}

/** True when the label describes something the user may want to act on. */
export function isSyncProblem(status: SyncStatus | null): boolean {
  return Boolean(status?.error && !NETWORK_FAILURE.test(status.error));
}
