import { useApp } from '../app/AppContext';
import { isSyncProblem, syncLabel } from '../sync/label';

/** Compact status in the corner of every screen. Tap to sync now. */
export default function SyncBadge() {
  const { syncStatus, syncBusy, requestSync } = useApp();
  return (
    <button
      type="button"
      onClick={requestSync}
      disabled={syncBusy}
      aria-label={`${syncLabel(syncStatus, syncBusy, navigator.onLine)}. Sync now`}
      className={`min-h-9 rounded-full px-3 text-xs ${isSyncProblem(syncStatus) ? 'text-red-400' : 'text-muted'}`}
    >
      {syncLabel(syncStatus, syncBusy, navigator.onLine)}
    </button>
  );
}
