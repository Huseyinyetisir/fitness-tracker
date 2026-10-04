import { useEffect, useMemo } from 'react';
import { AppContext, type AppContextValue } from './app/AppContext';
import AppShell from './app/AppShell';
import { bootstrapAfterSync } from './app/bootstrap';
import SignIn from './features/auth/SignIn';
import { useAuth } from './features/auth/useAuth';
import { today } from './lib/time';
import { useSync } from './sync/useSync';

export default function App() {
  const { session, loading } = useAuth();
  const userId = session?.user.id ?? null;
  const { status, busy, syncNow, exclusive } = useSync(userId);

  // First-time setup waits for a completed sync — see bootstrapAfterSync.
  useEffect(() => {
    if (!userId || !status?.lastSyncedAt) return;
    void (async () => {
      if (await bootstrapAfterSync(userId, today())) await syncNow();
    })();
  }, [userId, status?.lastSyncedAt, syncNow]);

  const value = useMemo<AppContextValue | null>(
    () =>
      userId
        ? { userId, syncStatus: status, syncBusy: busy, requestSync: () => void syncNow(), exclusive }
        : null,
    [userId, status, busy, syncNow, exclusive],
  );

  if (loading) return <main className="p-6 text-muted">Loading…</main>;
  if (!value) return <SignIn />;

  return (
    <AppContext.Provider value={value}>
      <AppShell />
    </AppContext.Provider>
  );
}
