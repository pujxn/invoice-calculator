import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitor = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  getPlatform: vi.fn(() => 'web'),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: capacitor }));

import { isNative, platformName } from '../src/platform/platform.js';

beforeEach(() => {
  capacitor.isNativePlatform.mockReturnValue(false);
  capacitor.getPlatform.mockReturnValue('web');
});

describe('platform detection', () => {
  it('is web in a browser', () => {
    expect(isNative()).toBe(false);
    expect(platformName()).toBe('web');
  });

  it('knows iOS and Android apps', () => {
    capacitor.isNativePlatform.mockReturnValue(true);
    capacitor.getPlatform.mockReturnValue('ios');
    expect(isNative()).toBe(true);
    expect(platformName()).toBe('ios');
    capacitor.getPlatform.mockReturnValue('android');
    expect(platformName()).toBe('android');
  });

  it('treats an unknown native platform as web, and a broken Capacitor as not native', () => {
    capacitor.isNativePlatform.mockReturnValue(true);
    capacitor.getPlatform.mockReturnValue('electron');
    expect(platformName()).toBe('web');
    capacitor.isNativePlatform.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(isNative()).toBe(false);
  });
});
