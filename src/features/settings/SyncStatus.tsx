import { useCallback, useEffect, useState } from 'react';
import { currentStatus, syncAll } from '../../sync/engine';
import { supabaseSyncClient } from '../../sync/supabaseSyncClient';
import type { SyncStatus as Status } from '../../sync/types';

export default function SyncStatus({ userId }: { userId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setStatus(await currentStatus());
  }, []);

  const runSync = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await syncAll(supabaseSyncClient, userId);
    } catch {
      // The engine already recorded the message; refresh surfaces it.
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [busy, refresh, userId]);

  useEffect(() => {
    void refresh();

    const onOnline = () => void runSync();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runSync();
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, runSync]);

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
        onClick={runSync}
        disabled={busy}
        className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
      >
        Sync now
      </button>
    </div>
  );
}
