import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.huseyin.fittracker',
  appName: 'Fit Tracker',
  webDir: 'dist',
  // The app's background, so nothing flashes white before the first paint.
  backgroundColor: '#0b0f14',
  plugins: {
    SystemBars: {
      // Older Android WebViews report wrong env(safe-area-inset-*) values;
      // 'css' injects correct ones as --safe-area-inset-*, which index.css prefers.
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      // Light status bar icons on the dark app.
      style: 'DARK',
    },
  },
};

export default config;
