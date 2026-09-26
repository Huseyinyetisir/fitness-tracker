import type { SyncStatus as Status } from '../../sync/types';

export default function SyncStatus({
  status,
  busy,
  onSync,
}: {
  status: Status | null;
  busy: boolean;
  onSync: () => void;
}) {
  const label = !navigator.onLine
    ? 'Offline'
    : busy
      ? 'Syncing…'
      : status?.error
        ? `Error: ${status.error}`
        : status?.pendingCount
          ? `${status.pendingCount} pending`
          : status?.lastSyncedAt
            ? `Synced ${new Date(status.lastSyncedAt).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}`
            : 'Not synced yet';

  return (
    <div className="flex items-center gap-3">
      <span
        aria-live="polite"
        className={status?.error ? 'text-red-400 text-sm' : 'text-[var(--color-muted)] text-sm'}
      >
        {label}
      </span>
      <button
        onClick={onSync}
        disabled={busy}
        className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
      >
        Sync now
      </button>
    </div>
  );
}
