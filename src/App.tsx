import { useEffect, useState } from 'react';
import { db } from './db/schema';
import { seedExercises } from './db/seed';
import { useAuth, signOut } from './features/auth/useAuth';
import SignIn from './features/auth/SignIn';

export default function App() {
  const { session, loading } = useAuth();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!session) return;
    (async () => {
      await seedExercises();
      setCount(await db.exercises.count());
    })();
  }, [session]);

  if (loading) {
    return <main className="p-6 text-[var(--color-muted)]">Loading…</main>;
  }

  if (!session) return <SignIn />;

  return (
    <main className="p-6 space-y-3">
      <h1 className="text-2xl font-semibold">Fit Tracker</h1>
      <p className="text-[var(--color-muted)]">Signed in as {session.user.email}</p>
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
