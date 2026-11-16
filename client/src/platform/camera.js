import { isNative } from './platform.js';

// Native camera and photo picker (iOS and Android), through Capacitor's Camera plugin.
// Both functions resolve with a File ready for the normal upload checks, or null when the person
// backs out. They reject with CaptureError (message safe to show) when something goes wrong, and
// with UnavailableError when the plugin is not there, so the caller can use the web file picker.
export class CaptureError extends Error {}
export class UnavailableError extends Error {}

// The plugin has no error codes for these, only English messages.
const CANCELLED = /cancel|no image picked|dismiss/i;
const DENIED = /denied|permission/i;

function extensionFor(type) {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'image/heic' || type === 'image/heif') return 'heic';
  return 'jpg';
}

async function capture(source) {
  if (!isNative()) throw new UnavailableError('Not running as a mobile app.');
  const { Camera, CameraResultType } = await import('@capacitor/camera');

  let photo;
  try {
    photo = await Camera.getPhoto({
      source,
      resultType: CameraResultType.Uri,
      // JPEG for everything: the server's AI step reads it directly, and phones that shoot HEIC
      // convert it here. Quality 85 keeps a 12 megapixel photo well under the 10 MB limit.
      quality: 85,
      correctOrientation: true,
      allowEditing: false,
      saveToGallery: false,
    });
  } catch (err) {
    const message = String(err?.message || err || '');
    if (err?.code === 'UNIMPLEMENTED') throw new UnavailableError(message);
    if (CANCELLED.test(message)) return null;
    if (DENIED.test(message)) {
      throw new CaptureError(
        'Ledgerly does not have permission to use the camera or photos. Allow it in your phone’s Settings, then try again.',
      );
    }
    throw new CaptureError('Could not get the picture. Please try again.');
  }

  if (!photo?.webPath) throw new CaptureError('Could not get the picture. Please try again.');
  try {
    const res = await fetch(photo.webPath);
    const blob = await res.blob();
    const type = blob.type || `image/${photo.format || 'jpeg'}`;
    return new File([blob], `invoice-${Date.now()}.${extensionFor(type)}`, { type });
  } catch {
    throw new CaptureError('Could not read the picture. Please try again.');
  }
}

export async function takePhoto() {
  const { CameraSource } = await import('@capacitor/camera');
  return capture(CameraSource.Camera);
}

export async function choosePhoto() {
  const { CameraSource } = await import('@capacitor/camera');
  return capture(CameraSource.Photos);
}
