import { Capacitor } from '@capacitor/core';

// True inside the Ledgerly iOS or Android app, false in a normal browser. Everything that only
// makes sense on a phone (native camera, status bar, server address) is behind this check, so
// the web app behaves exactly as before.
export const isNative = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

// 'ios', 'android' or 'web'.
export const platformName = () => {
  if (!isNative()) return 'web';
  const name = Capacitor.getPlatform();
  return name === 'ios' || name === 'android' ? name : 'web';
};
