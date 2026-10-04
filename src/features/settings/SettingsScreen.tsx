import { useApp } from '../../app/AppContext';
import { Checkbox } from '../../components/Fields';
import ScreenHeader from '../../components/ScreenHeader';
import Stepper from '../../components/Stepper';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import AccountSection from './AccountSection';
import DataSection from './DataSection';
import DemoSection from './DemoSection';
import { prefsId, updatePrefs } from './prefsRepo';
import SyncStatus from './SyncStatus';
import { usePrefs } from './usePrefs';

export default function SettingsScreen() {
  const { userId, syncStatus, syncBusy, requestSync } = useApp();
  const prefs = usePrefs(userId);
  const hasPrefsRow = useLiveQuery(async () => Boolean(await db.user_prefs.get(prefsId(userId))), [userId]);

  return (
    <section>
      <ScreenHeader title="Settings" />
      <div className="space-y-6">
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-medium">Sync</h2>
          <SyncStatus status={syncStatus} busy={syncBusy} onSync={requestSync} />
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-medium">Rest timer</h2>
          {hasPrefsRow === false ? (
            <p className="text-sm text-muted">Available once the first sync completes.</p>
          ) : (
            <>
              <Stepper
                label="Rest s"
                value={prefs.rest_seconds_default}
                step={15}
                min={15}
                max={600}
                onChange={(rest_seconds_default) => void updatePrefs(userId, { rest_seconds_default })}
              />
              <p className="text-xs text-muted">Used when a workout does not set its own rest for an exercise.</p>
              <Checkbox
                label="Vibrate when rest is over"
                checked={prefs.vibration}
                onChange={(vibration) => void updatePrefs(userId, { vibration })}
              />
              <p className="text-xs text-muted">
                In the Android app, a locked phone gets the alert as a notification — allow notifications when asked.
              </p>
            </>
          )}
        </div>

        <DataSection />
        <DemoSection />
        <AccountSection />
      </div>
    </section>
  );
}
