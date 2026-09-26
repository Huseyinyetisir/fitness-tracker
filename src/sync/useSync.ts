import { useCallback, useEffect, useRef, useState } from 'react';
import { currentStatus, syncAll } from './engine';
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
  // A ref, not the busy state: two events firing in the same tick both read
  // the same stale state value and start overlapping syncs.
  const running = useRef(false);

  const refresh = useCallback(async () => {
    setStatus(await currentStatus());
  }, []);

  const syncNow = useCallback(async () => {
    if (!userId || running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await syncAll(supabaseSyncClient, userId);
    } catch {
      // The engine records the message; refresh surfaces it.
    } finally {
      running.current = false;
      setBusy(false);
      await refresh();
    }
  }, [refresh, userId]);

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

  return { status, busy, syncNow, refresh };
}
