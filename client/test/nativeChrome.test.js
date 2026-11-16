import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  platformName: vi.fn(() => 'ios'),
}));
const statusBar = vi.hoisted(() => ({
  setStyle: vi.fn(async () => {}),
  setBackgroundColor: vi.fn(async () => {}),
}));
const splash = vi.hoisted(() => ({ hide: vi.fn(async () => {}) }));
vi.mock('../src/platform/platform.js', () => platform);
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: statusBar,
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: splash }));

import { setUpNativeChrome } from '../src/platform/nativeChrome.js';

function media(matches) {
  const listeners = [];
  return {
    list: listeners,
    mq: () => ({
      matches,
      addEventListener: (_type, fn) => listeners.push(fn),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  platform.isNative.mockReturnValue(true);
  platform.platformName.mockReturnValue('ios');
  document.documentElement.className = '';
  document.documentElement.style.removeProperty('--bg');
});

describe('native app chrome', () => {
  it('does nothing in a browser', async () => {
    platform.isNative.mockReturnValue(false);
    expect(await setUpNativeChrome()).toBe(false);
    expect(document.documentElement.className).toBe('');
    expect(statusBar.setStyle).not.toHaveBeenCalled();
    expect(splash.hide).not.toHaveBeenCalled();
  });

  it('marks the page, sets a light-theme status bar and hides the splash', async () => {
    expect(await setUpNativeChrome({ matchMedia: media(false).mq })).toBe(true);
    expect(document.documentElement).toHaveClass('native', 'native-ios');
    expect(statusBar.setStyle).toHaveBeenCalledWith({ style: 'LIGHT' }); // dark text, light page
    expect(statusBar.setBackgroundColor).not.toHaveBeenCalled(); // iOS has no coloured bar
    expect(splash.hide).toHaveBeenCalledTimes(1);
  });

  it('uses light text in dark mode and follows later changes', async () => {
    const m = media(true);
    await setUpNativeChrome({ matchMedia: m.mq });
    expect(statusBar.setStyle).toHaveBeenLastCalledWith({ style: 'DARK' });
    m.list[0]({ matches: false });
    expect(statusBar.setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' });
  });

  it('on Android colours the bar with the page background', async () => {
    platform.platformName.mockReturnValue('android');
    document.documentElement.style.setProperty('--bg', ' #fff7fa ');
    await setUpNativeChrome({ matchMedia: media(false).mq });
    expect(document.documentElement).toHaveClass('native-android');
    expect(statusBar.setBackgroundColor).toHaveBeenCalledWith({ color: '#fff7fa' });
  });

  it('never throws when a plugin call fails, and still hides the splash', async () => {
    statusBar.setStyle.mockRejectedValueOnce(new Error('not implemented'));
    await expect(setUpNativeChrome({ matchMedia: media(false).mq })).resolves.toBe(true);
    expect(splash.hide).toHaveBeenCalled();
  });
});
