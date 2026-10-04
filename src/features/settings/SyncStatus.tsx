import { isSyncProblem, syncLabel } from '../../sync/label';
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
  return (
    <div className="flex items-center gap-3">
      <span
        aria-live="polite"
        className={`flex-1 text-sm ${isSyncProblem(status) ? 'text-red-400' : 'text-muted'}`}
      >
        {syncLabel(status, busy, navigator.onLine)}
      </span>
      <button
        type="button"
        onClick={onSync}
        disabled={busy}
        className="min-h-12 rounded-xl border border-border px-4 text-sm disabled:opacity-50"
      >
        Sync now
      </button>
    </div>
  );
}
