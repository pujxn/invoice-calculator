import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ isNative: vi.fn(() => true) }));
const plugin = vi.hoisted(() => ({ getPhoto: vi.fn() }));
vi.mock('../src/platform/platform.js', () => platform);
vi.mock('@capacitor/camera', () => ({
  Camera: plugin,
  CameraResultType: { Uri: 'uri' },
  CameraSource: { Camera: 'CAMERA', Photos: 'PHOTOS' },
}));

import { CaptureError, UnavailableError, choosePhoto, takePhoto } from '../src/platform/camera.js';

const jpeg = (type = 'image/jpeg') => new Blob(['pixels'], { type });

beforeEach(() => {
  vi.clearAllMocks();
  platform.isNative.mockReturnValue(true);
  plugin.getPhoto.mockResolvedValue({
    webPath: 'capacitor://localhost/_capacitor_file_/p.jpg',
    format: 'jpeg',
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ blob: async () => jpeg() })),
  );
});

describe('native camera and photo picker', () => {
  it('takePhoto opens the camera and returns the picture as a JPEG File', async () => {
    const file = await takePhoto();
    expect(plugin.getPhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'CAMERA',
        resultType: 'uri',
        correctOrientation: true,
        saveToGallery: false,
        allowEditing: false,
      }),
    );
    expect(fetch).toHaveBeenCalledWith('capacitor://localhost/_capacitor_file_/p.jpg');
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/jpeg');
    expect(file.name).toMatch(/^invoice-\d+\.jpg$/);
    expect(file.size).toBe(6);
  });

  it('choosePhoto opens the photo library', async () => {
    await choosePhoto();
    expect(plugin.getPhoto).toHaveBeenCalledWith(expect.objectContaining({ source: 'PHOTOS' }));
  });

  it('names the file after what the phone returned, and falls back to the reported format', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => jpeg('image/png') })),
    );
    expect((await takePhoto()).name).toMatch(/\.png$/);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => jpeg('') })),
    );
    plugin.getPhoto.mockResolvedValue({ webPath: 'x', format: 'jpeg' });
    const file = await takePhoto();
    expect(file.type).toBe('image/jpeg');
  });

  it('returns null when the person backs out', async () => {
    for (const message of [
      'User cancelled photos app',
      'No image picked',
      'Photo picker dismissed',
    ]) {
      plugin.getPhoto.mockRejectedValueOnce(new Error(message));
      expect(await takePhoto()).toBeNull();
    }
  });

  it('explains a refused permission in plain words', async () => {
    plugin.getPhoto.mockRejectedValueOnce(new Error('User denied access to camera'));
    const err = await takePhoto().catch((e) => e);
    expect(err).toBeInstanceOf(CaptureError);
    expect(err.message).toMatch(/Settings/);
  });

  it('turns any other plugin failure into a short safe message', async () => {
    plugin.getPhoto.mockRejectedValueOnce(new Error('java.lang.NullPointerException at com.x'));
    const err = await takePhoto().catch((e) => e);
    expect(err).toBeInstanceOf(CaptureError);
    expect(err.message).toBe('Could not get the picture. Please try again.');
  });

  it('fails clearly when the file cannot be read back or the plugin returns nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('nope'))),
    );
    await expect(takePhoto()).rejects.toThrow(/Could not read the picture/);
    plugin.getPhoto.mockResolvedValueOnce({});
    await expect(takePhoto()).rejects.toThrow(/Could not get the picture/);
  });

  it('says it is unavailable in a browser, or where the plugin is not implemented', async () => {
    platform.isNative.mockReturnValue(false);
    await expect(takePhoto()).rejects.toBeInstanceOf(UnavailableError);
    expect(plugin.getPhoto).not.toHaveBeenCalled();

    platform.isNative.mockReturnValue(true);
    plugin.getPhoto.mockRejectedValueOnce(
      Object.assign(new Error('not here'), { code: 'UNIMPLEMENTED' }),
    );
    await expect(choosePhoto()).rejects.toBeInstanceOf(UnavailableError);
  });
});
