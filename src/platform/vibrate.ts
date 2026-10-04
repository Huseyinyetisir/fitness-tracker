import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';

const PULSE_MS = 300;
const GAP_MS = 150;

/**
 * Two firm pulses — "rest is over". In the Android app this goes through
 * Capacitor Haptics, which works whatever the WebView supports; in a browser,
 * through the Vibration API where there is one.
 */
export function vibrate(): void {
  if (Capacitor.isNativePlatform()) {
    void Haptics.vibrate({ duration: PULSE_MS });
    setTimeout(() => void Haptics.vibrate({ duration: PULSE_MS }), PULSE_MS + GAP_MS);
  } else if (typeof navigator.vibrate === 'function') {
    navigator.vibrate([PULSE_MS, GAP_MS, PULSE_MS]);
  }
}
