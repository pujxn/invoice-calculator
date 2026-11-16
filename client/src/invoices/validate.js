// Quick checks in the browser so people get an instant answer. The server checks again
// (by looking at the file's actual bytes), so these are a courtesy, not the security.
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_LABEL = '10 MB';
export const TYPE_LABEL = 'JPEG, PNG, WebP or HEIC';
export const ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';

const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Returns an error message, or null when the file looks fine to send.
export function validateFile(file) {
  if (!file) return 'Choose a picture to upload.';
  // Some browsers report no type for HEIC files, so fall back to the extension.
  const ext = file.name?.split('.').pop()?.toLowerCase();
  const okType = file.type ? MIME_TYPES.has(file.type.toLowerCase()) : EXTENSIONS.has(ext);
  if (!okType) return `That file is not a ${TYPE_LABEL} picture.`;
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_BYTES) {
    return `That picture is ${formatSize(file.size)}. The limit is ${MAX_LABEL}.`;
  }
  return null;
}
