import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectImageType } from '../src/invoices/fileType.js';
import { GIF, heic, JPEG, PDF, PNG, SVG, TEXT, WEBP } from './samples.js';

test('detects JPEG, PNG, WebP and HEIC by their first bytes', () => {
  assert.deepEqual(detectImageType(JPEG), { mime: 'image/jpeg', ext: 'jpg' });
  assert.deepEqual(detectImageType(PNG), { mime: 'image/png', ext: 'png' });
  assert.deepEqual(detectImageType(WEBP), { mime: 'image/webp', ext: 'webp' });
  for (const brand of ['heic', 'heix', 'mif1', 'hevc']) {
    assert.equal(detectImageType(heic(brand))?.mime, 'image/heic', brand);
  }
});

test('rejects other formats, text and look-alikes', () => {
  for (const [name, buf] of Object.entries({ GIF, PDF, SVG, TEXT })) {
    assert.equal(detectImageType(buf), null, name);
  }
  // Right container shape, wrong brand (an MP4 video also has an ftyp box).
  assert.equal(detectImageType(heic('isom')), null);
  // RIFF but not WebP (a WAV audio file).
  assert.equal(
    detectImageType(Buffer.concat([Buffer.from('RIFF....WAVEfmt '), Buffer.alloc(8)])),
    null,
  );
});

test('rejects empty, short and non-buffer input without throwing', () => {
  assert.equal(detectImageType(Buffer.alloc(0)), null);
  assert.equal(detectImageType(Buffer.from([0xff, 0xd8, 0xff])), null);
  assert.equal(detectImageType(null), null);
  assert.equal(detectImageType('image'), null);
});
