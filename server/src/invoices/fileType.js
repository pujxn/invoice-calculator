// Identifies an image by its first bytes. The browser's file name and Content-Type are
// supplied by the client, so they are never trusted; only what the bytes say counts.
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

export const IMAGE_TYPES = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  png: { mime: 'image/png', ext: 'png' },
  webp: { mime: 'image/webp', ext: 'webp' },
  heic: { mime: 'image/heic', ext: 'heic' },
};

const ascii = (buf, start, end) => buf.toString('latin1', start, end);

// Returns { mime, ext } for JPEG, PNG, WebP or HEIC/HEIF data, else null.
export function detectImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return IMAGE_TYPES.jpeg;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return IMAGE_TYPES.png;
  }
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return IMAGE_TYPES.webp;
  if (ascii(buf, 4, 8) === 'ftyp' && HEIF_BRANDS.has(ascii(buf, 8, 12))) return IMAGE_TYPES.heic;
  return null;
}

export const mimeForExt = (ext) =>
  Object.values(IMAGE_TYPES).find((t) => t.ext === ext)?.mime ?? 'application/octet-stream';
