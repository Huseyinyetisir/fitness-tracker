import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * Android's back button walks the app's own history, as Back does in a
 * browser — every screen is a hash route. From the first screen it sends the
 * app to the background, as other Android apps do; without a listener it
 * would do nothing there.
 */
export function installBackButton(): void {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.minimizeApp();
  });
}
