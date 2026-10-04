import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useEffect } from 'react';

/**
 * The rest-over alert while the app is in the background.
 *
 * Android ignores haptic vibration from an app that is not in the foreground
 * — screen off counts — so the in-app buzz cannot reach a phone locked
 * between sets. Instead, whenever the app leaves the foreground mid-rest, a
 * notification is scheduled for the moment rest ends, on a channel that
 * vibrates. Coming back cancels it, and the in-app buzz takes over again, so
 * the alert never fires twice.
 */

const CHANNEL = 'rest-timer';
const NOTIFICATION_ID = 1;

let ready: Promise<boolean> | null = null;
let asked = false;

/**
 * Asks for notification permission (once, on first use) and creates the
 * channel. Resolves to whether alerts can be shown. In a browser: false.
 */
export function prepareRestAlert(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(false);
  ready ??= prepare().then((ok) => {
    // Only a grant is kept. The user can allow notifications later in the
    // system settings, and a denied permission is re-checked without prompting.
    if (!ok) ready = null;
    return ok;
  });
  return ready;
}

function prepare(): Promise<boolean> {
  return (async () => {
    let { display } = await LocalNotifications.checkPermissions();
    // After a refusal Android reports 'prompt-with-rationale'; asking again
    // on every rest would nag, so this process asks only once.
    if (!asked && (display === 'prompt' || display === 'prompt-with-rationale')) {
      asked = true;
      ({ display } = await LocalNotifications.requestPermissions());
    }
    if (display !== 'granted') return false;
    await LocalNotifications.createChannel({
      id: CHANNEL,
      name: 'Rest timer',
      description: 'When the rest between sets is over',
      importance: 5,
      visibility: 1,
      vibration: true,
    });
    return true;
  })().catch(() => false);
}

async function arm(endsAt: number): Promise<void> {
  if (!(await prepareRestAlert())) return;
  // USE_EXACT_ALARM, declared in the manifest, makes exact alarms available.
  // If they are not, schedule inexact rather than let the plugin open the
  // system settings screen in the middle of a workout.
  const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: NOTIFICATION_ID,
        title: 'Rest over',
        body: 'Time for your next set.',
        channelId: CHANNEL,
        smallIcon: 'ic_stat_rest',
        schedule: { at: new Date(endsAt), allowWhileIdle: true },
        isExactNotification: exact_alarm === 'granted',
      },
    ],
  });
}

async function disarm(): Promise<void> {
  await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
  await LocalNotifications.removeAllDeliveredNotifications();
}

let queue: Promise<void> = Promise.resolve();

/**
 * Runs scheduling and cancelling strictly in order. Arming awaits permission
 * and settings first, so a quick background-and-back could otherwise schedule
 * the alert after the cancel that was meant to follow it.
 */
function inOrder(step: () => Promise<void>): void {
  queue = queue.then(step).catch(() => undefined);
}

/** Keeps the background alert in step with the rest timer and the app's foreground state. */
export function useRestAlert(endsAt: number | null, enabled: boolean): void {
  // Mounting happens in the foreground, where the in-app buzz is the alert. A
  // notification still scheduled by a previous process — the app was killed
  // mid-rest — would fire a second time, so it goes.
  useEffect(() => {
    if (Capacitor.isNativePlatform()) inOrder(disarm);
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || endsAt === null || !enabled) return;
    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) inOrder(disarm);
      else if (endsAt > Date.now()) inOrder(() => arm(endsAt));
    });
    return () => {
      void listener.then((l) => l.remove());
      inOrder(disarm);
    };
  }, [endsAt, enabled]);
}
