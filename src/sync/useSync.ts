import { liveQuery } from 'dexie';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { currentStatus, pendingCount, syncAll } from './engine';
import { SyncLock } from './lock';
import { supabaseSyncClient } from './supabaseSyncClient';
import type { SyncStatus } from './types';

/**
 * Owns the sync lifecycle for the whole app.
 *
 * Deliberately not inside a screen component: sync has to keep running while
 * the user is on the logging screen, and a widget that unmounts would take the
 * listeners with it.
 */
export function useSync(userId: string | null) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [lock] = useState(() => new SyncLock());
  const [livePending, setLivePending] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setStatus(await currentStatus());
  }, []);

  const syncNow = useCallback(async () => {
    // Skipped, not queued, while anything holds the lock: the next trigger
    // will sync, and a queued sync after a wipe would only repeat its work.
    if (!userId || lock.busy) return;
    setBusy(true);
    try {
      await lock.run(async () => {
        try {
          await syncAll(supabaseSyncClient, userId);
        } catch {
          // The engine records the message; refresh surfaces it.
        }
      });
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [lock, refresh, userId]);

  /** Runs a task that must not overlap a sync, waiting for one in progress to finish first. */
  const exclusive = useCallback(
    async <T,>(task: () => Promise<T>): Promise<T> => {
      try {
        return await lock.run(task);
      } finally {
        await refresh();
      }
    },
    [lock, refresh],
  );

  useEffect(() => {
    if (!userId) return;

    // Run once on mount: visibilitychange does not fire on initial load, so
    // without this nothing syncs until the user backgrounds and returns.
    void syncNow();

    const onOnline = () => void syncNow();
    const onOffline = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, syncNow, refresh]);

  // Local writes never pass through this hook, so without a live query the
  // count would only move on a sync and could say "Synced" over unsent edits.
  useEffect(() => {
    const subscription = liveQuery(pendingCount).subscribe({
      next: setLivePending,
      error: (err) => console.error('pending count failed', err),
    });
    return () => subscription.unsubscribe();
  }, []);

  const liveStatus = useMemo(
    () => (status && livePending !== null ? { ...status, pendingCount: livePending } : status),
    [status, livePending],
  );

  return { status: liveStatus, busy, syncNow, refresh, exclusive };
}
