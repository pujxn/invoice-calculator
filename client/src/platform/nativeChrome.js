import { isNative, platformName } from './platform.js';

// Makes the web app feel at home inside the native shell: status bar colours that follow the
// light or dark theme, the splash screen hidden once the page has drawn, and CSS hooks
// (html.native, html.native-ios, html.native-android). Does nothing in a browser, and never
// throws: the app must work even if a plugin is missing.
export async function setUpNativeChrome({
  doc = document,
  matchMedia = window.matchMedia?.bind(window),
} = {}) {
  if (!isNative()) return false;
  const platform = platformName();
  doc.documentElement.classList.add('native', `native-${platform}`);

  try {
    const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
      import('@capacitor/status-bar'),
      import('@capacitor/splash-screen'),
    ]);

    // Light text on the dark theme, dark text on the light theme (Style.Dark means "for dark
    // backgrounds"). The Android bar takes the page's own background colour so it blends in.
    const apply = async (dark) => {
      try {
        await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
        if (platform === 'android') {
          const bg = getComputedStyle(doc.documentElement).getPropertyValue('--bg').trim();
          if (bg) await StatusBar.setBackgroundColor({ color: bg });
        }
      } catch {
        // an old webview or a missing method: the default bar is acceptable
      }
    };
    const query = matchMedia?.('(prefers-color-scheme: dark)');
    await apply(Boolean(query?.matches));
    query?.addEventListener?.('change', (e) => apply(e.matches));

    await SplashScreen.hide();
  } catch {
    // plugins unavailable: the splash safety timeout in capacitor.config.ts still hides it
  }
  return true;
}
