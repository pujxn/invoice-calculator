import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor settings for the Ledgerly iOS and Android apps.
//
// `npm run native:sync` sets LEDGERLY_NATIVE_ENV before this file is read:
//   - "development" (the default for the run/open scripts): the app may talk to a plain http API
//     on this computer (Android mixed content and cleartext are allowed).
//   - "production": http is never allowed. Running `npx cap sync` by hand also counts as
//     production, so a forgotten variable can only make the app stricter, never looser.
const development = process.env.LEDGERLY_NATIVE_ENV === 'development';

const config: CapacitorConfig = {
  // Reverse-domain id used by the App Store and Google Play. Change it once, here, before you
  // publish (it cannot change afterwards).
  appId: 'com.ledgerly.app',
  appName: 'Ledgerly',
  // Where `npm run native:sync` writes the web app that is copied into the native shells.
  webDir: 'dist-native',
  server: {
    // Keep both on https so the webview origin (https://localhost on Android) never changes
    // between dev and production: changing it would sign everyone out. iOS uses capacitor://localhost.
    androidScheme: 'https',
    ...(development ? { cleartext: true } : {}),
  },
  android: {
    // Lets the https page call the http API on your computer. Development only.
    allowMixedContent: development,
    // Android 15 forces edge-to-edge; this keeps the page clear of the bars on every version.
    adjustMarginsForEdgeToEdge: 'auto',
  },
  plugins: {
    SplashScreen: {
      // The page hides the splash itself once it has drawn; this is only the safety net.
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#fff7fa',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    Keyboard: {
      // Shrinks the page above the keyboard so the focused field stays visible.
      resize: 'body',
    },
  },
};

export default config;
