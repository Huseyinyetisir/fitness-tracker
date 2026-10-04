import { useEffect, useState } from 'react';
import { db } from './db/schema';
import { seedExercises } from './db/seed';
import { useAuth, signOut } from './features/auth/useAuth';
import SignIn from './features/auth/SignIn';
import SyncStatus from './features/settings/SyncStatus';
import { useSync } from './sync/useSync';

export default function App() {
  const { session, loading } = useAuth();
  const userId = session?.user.id ?? null;
  const { status, busy, syncNow } = useSync(userId);
  const [count, setCount] = useState<number | null>(null);

  // Seeding waits for a sync to have completed, so it runs off the sync
  // status rather than off sign-in.
  useEffect(() => {
    if (!userId || !status?.lastSyncedAt) return;
    (async () => {
      const seeded = await seedExercises();
      setCount(await db.exercises.where('_deleted').equals(0).count());
      // Seeding only happens after a completed sync, so nothing else will
      // push these rows until the next trigger. Push them now.
      if (seeded > 0) await syncNow();
    })();
  }, [userId, status?.lastSyncedAt, syncNow]);

  if (loading) {
    return <main className="p-6 text-[var(--color-muted)]">Loading…</main>;
  }

  if (!session) return <SignIn />;

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Fit Tracker</h1>
      <SyncStatus status={status} busy={busy} onSync={() => void syncNow()} />
      <p className="text-[var(--color-muted)]">
        Exercise library: <span className="text-[var(--color-text)]">{count ?? '…'}</span>
      </p>
      <button
        onClick={signOut}
        className="rounded-lg border border-[var(--color-border)] px-4 py-2"
      >
        Sign out
      </button>
    </main>
  );
}
