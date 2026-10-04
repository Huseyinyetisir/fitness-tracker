import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useSingleFlight } from '../../app/useSingleFlight';
import Button from '../../components/Button';
import ConfirmPhrase from '../../components/ConfirmPhrase';
import { supabaseSyncClient } from '../../sync/supabaseSyncClient';
import { clearLocalDataUnlessPending, wipeAccount } from '../../sync/wipe';
import { signOut } from '../auth/useAuth';

type Panel = 'none' | 'sign-out' | 'delete';

export default function AccountSection() {
  const { userId, syncBusy, exclusive, requestSync } = useApp();
  const { busy, run } = useSingleFlight();
  const [panel, setPanel] = useState<Panel>('none');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  /**
   * Signing out empties this device. Rows left behind would otherwise be
   * pushed under whichever account signs in next. Unsent changes are counted
   * inside the lock, so a sync cannot change them between the check and the clear.
   */
  const signOutAndClear = (force: boolean) =>
    run(async () => {
      const unsent = await exclusive(async () => {
        const count = await clearLocalDataUnlessPending(force);
        if (count === 0) await signOut();
        return count;
      });
      if (unsent > 0) {
        setPending(unsent);
        setPanel('sign-out');
      }
    });

  // Closing the panel means the next Sign out counts again after this sync.
  const syncInstead = () => {
    requestSync();
    setPanel('none');
  };

  const deleteEverything = () =>
    run(async () => {
      setError(null);
      if (!navigator.onLine) {
        setError('You are offline. Deleting needs a connection, so the server copy goes too.');
        return;
      }
      try {
        await exclusive(() => wipeAccount(supabaseSyncClient, userId));
        setPanel('none');
        // The first sync after the wipe sets the library, plan and preferences up afresh.
        requestSync();
      } catch (e) {
        setError(`Nothing was deleted on this device: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-medium">Account</h2>

      {panel === 'sign-out' ? (
        <div className="space-y-3 rounded-xl border border-amber-400/60 p-3 text-sm">
          <p>
            {pending} {pending === 1 ? 'change on this device has' : 'changes on this device have'} not reached the
            server yet. Signing out removes this device's copy, so {pending === 1 ? 'it' : 'they'} would be lost.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy || syncBusy} onClick={syncInstead}>
              Sync now
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void signOutAndClear(true)}>
              Sign out anyway
            </Button>
          </div>
          <Button variant="ghost" block onClick={() => setPanel('none')}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button block disabled={busy} onClick={() => void signOutAndClear(false)}>
          Sign out
        </Button>
      )}

      {panel === 'delete' ? (
        <ConfirmPhrase phrase="DELETE" action="Delete everything" busy={busy} onCancel={() => setPanel('none')} onConfirm={() => void deleteEverything()}>
          <p className="mb-2">
            Deletes every workout, session, run, plan, body entry and setting — on the server and on this device. This
            cannot be undone. Export a backup first if you might want any of it.
          </p>
          <p className="text-muted">Needs a connection. Other signed-in devices keep their copy until they sign out.</p>
        </ConfirmPhrase>
      ) : (
        <Button variant="danger" block disabled={busy} onClick={() => setPanel('delete')}>
          Delete all data…
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
