import { useApp } from '../../app/AppContext';
import Button from '../../components/Button';
import ScreenHeader from '../../components/ScreenHeader';
import { signOut } from '../auth/useAuth';
import SyncStatus from './SyncStatus';

export default function SettingsScreen() {
  const { syncStatus, syncBusy, requestSync } = useApp();
  return (
    <section>
      <ScreenHeader title="Settings" />
      <div className="space-y-6">
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-medium">Sync</h2>
          <SyncStatus status={syncStatus} busy={syncBusy} onSync={requestSync} />
        </div>
        <Button variant="danger" block onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </section>
  );
}
