import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { prepareImage } from '../src/extraction/prepareImage.js';
import { detectImageType } from '../src/invoices/fileType.js';

const solid = (width, height, background = '#ffffff') =>
  sharp({ create: { width, height, channels: 3, background } });

test('PNG, JPEG and WebP all come out as JPEG', async () => {
  for (const [format, mime] of [
    ['png', 'image/png'],
    ['jpeg', 'image/jpeg'],
    ['webp', 'image/webp'],
  ]) {
    const input = await solid(300, 200)[format]().toBuffer();
    const out = await prepareImage(input, mime);
    assert.equal(out.mediaType, 'image/jpeg');
    assert.equal(detectImageType(out.data).mime, 'image/jpeg');
    assert.deepEqual([out.width, out.height], [300, 200]);
  }
});

test('large pictures are scaled down and small ones are left alone', async () => {
  const big = await solid(4000, 3000).jpeg().toBuffer();
  const out = await prepareImage(big, 'image/jpeg');
  assert.deepEqual([out.width, out.height], [2000, 1500]);
  const small = await solid(640, 480).png().toBuffer();
  assert.deepEqual(
    [
      (await prepareImage(small, 'image/png')).width,
      (await prepareImage(small, 'image/png')).height,
    ],
    [640, 480],
  );
});

test('phone rotation is applied and location data is dropped', async () => {
  // Stored sideways (300 wide) with an EXIF "rotate 90" flag, as phones do.
  const input = await solid(300, 100).withMetadata({ orientation: 6 }).jpeg().toBuffer();
  assert.equal((await sharp(input).metadata()).orientation, 6);
  const out = await prepareImage(input, 'image/jpeg');
  assert.deepEqual([out.width, out.height], [100, 300]);
  const meta = await sharp(out.data).metadata();
  assert.equal(meta.exif, undefined, 'no EXIF is passed on');
});

test('transparent PNGs are flattened onto white, not black', async () => {
  const input = await sharp({
    create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
  const out = await prepareImage(input, 'image/png');
  const { data } = await sharp(out.data).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 240 && data[1] > 240 && data[2] > 240);
});

test('a picture that is too heavy is recompressed under the model limit', async () => {
  // Random noise does not compress, so this stays large until quality drops.
  const noise = Buffer.alloc(2000 * 2000 * 3);
  for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 2654435761) >>> 24;
  const input = await sharp(noise, { raw: { width: 2000, height: 2000, channels: 3 } })
    .png()
    .toBuffer();
  const out = await prepareImage(input, 'image/png');
  assert.ok(out.data.length <= 4 * 1024 * 1024, `was ${out.data.length}`);
});

test('HEIC is converted first, using the converter it is given', async () => {
  const jpeg = await solid(120, 80).jpeg().toBuffer();
  const seen = [];
  const out = await prepareImage(Buffer.from('fake heic bytes'), 'image/heic', {
    convertHeic: async (opts) => {
      seen.push(opts);
      return jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.length); // ArrayBuffer, like the real one
    },
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].format, 'JPEG');
  assert.equal(out.mediaType, 'image/jpeg');
  assert.deepEqual([out.width, out.height], [120, 80]);
});

test('a HEIC that will not convert, or a broken file, is "unreadable_image"', async () => {
  await assert.rejects(
    prepareImage(Buffer.from('x'), 'image/heic', {
      convertHeic: async () => {
        throw new Error('bad heic');
      },
    }),
    { code: 'unreadable_image', status: 422 },
  );
  await assert.rejects(prepareImage(Buffer.from('definitely not a jpeg'), 'image/jpeg'), {
    code: 'unreadable_image',
    status: 422,
  });
  // Magic bytes of a JPEG, nothing after them.
  await assert.rejects(prepareImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), 'image/jpeg'), {
    code: 'unreadable_image',
  });
});

// A real iPhone photo, used when the file is around (it is not in the repository).
const REAL_HEIC = process.env.HEIC_SAMPLE || '/mnt/project-files/IMG_0688.HEIC';
test(
  'a real HEIC photo converts to a readable JPEG',
  { skip: !existsSync(REAL_HEIC) },
  async () => {
    const out = await prepareImage(readFileSync(REAL_HEIC), 'image/heic');
    assert.equal(out.mediaType, 'image/jpeg');
    assert.ok(Math.max(out.width, out.height) <= 2000);
    assert.ok(out.data.length > 10_000);
  },
);
