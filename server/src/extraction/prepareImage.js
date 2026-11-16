import sharp from 'sharp';
import heicConvert from 'heic-convert';
import { ExtractionError } from './errors.js';

// The vision model reads JPEG, PNG, GIF and WebP, not HEIC (the iPhone default), and it caps
// pictures at 5 MB. So every picture is turned into a plain JPEG first: HEIC is converted,
// phone rotation is applied, very large pictures are scaled down, and location and other
// metadata are dropped (they are never needed to read an invoice).
const MAX_SIDE = 2000;
const MAX_BYTES = 4 * 1024 * 1024;

const unreadable = (cause) =>
  new ExtractionError(
    'unreadable_image',
    'We could not open this picture. Try taking the photo again, or choose a different file.',
    { status: 422, cause },
  );

// `convertHeic` can be swapped in tests.
export async function prepareImage(buffer, mimeType, { convertHeic = heicConvert } = {}) {
  let source = buffer;
  try {
    if (mimeType === 'image/heic') {
      source = Buffer.from(await convertHeic({ buffer, format: 'JPEG', quality: 0.92 }));
    }
    // failOn 'error' lets slightly damaged files through but still rejects ones that are not images.
    let quality = 88;
    for (;;) {
      const out = await sharp(source, { failOn: 'error', limitInputPixels: 200_000_000 })
        .rotate()
        .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' }) // transparent PNGs would otherwise turn black
        .jpeg({ quality, mozjpeg: true })
        .toBuffer({ resolveWithObject: true });
      if (out.data.length <= MAX_BYTES || quality <= 50) {
        return {
          data: out.data,
          mediaType: 'image/jpeg',
          width: out.info.width,
          height: out.info.height,
        };
      }
      quality -= 15;
    }
  } catch (err) {
    throw unreadable(err);
  }
}
