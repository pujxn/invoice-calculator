import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {
  binarize,
  findPaper,
  flattenLight,
  greyPixels,
  otsu,
  removeRuledLines,
} from '../src/extraction/providers/ocrImage.js';

// Picture clean-up for the free OCR reader, on small drawn pictures.

const svg = (w, h, body) =>
  sharp(
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`),
  )
    .png()
    .toBuffer();

test('the page is found on a dark desk and cut out just inside its edge', async () => {
  const photo = await svg(
    800,
    600,
    '<rect width="800" height="600" fill="#3b3532"/><rect x="200" y="150" width="400" height="250" fill="#f1eee4"/>',
  );
  const box = await findPaper(photo);
  assert.ok(box, 'a page was found');
  assert.ok(box.left >= 200 && box.left < 215, `left ${box.left}`);
  assert.ok(box.top >= 150 && box.top < 165, `top ${box.top}`);
  assert.ok(box.left + box.width <= 600 && box.left + box.width > 585, `right`);
  assert.ok(box.top + box.height <= 400 && box.top + box.height > 385, `bottom`);
});

test('a scan or screenshot (page fills the picture) is not cut', async () => {
  const scan = await svg(
    600,
    400,
    '<rect width="600" height="400" fill="#fff"/><text x="40" y="80" font-size="30">Debit: 500</text>',
  );
  assert.equal(await findPaper(scan), null);
  const dark = await svg(600, 400, '<rect width="600" height="400" fill="#222"/>');
  assert.equal(await findPaper(dark), null);
});

test('uneven light is evened out: a shadowed corner becomes paper white, ink stays dark', async () => {
  const shaded = await svg(
    400,
    200,
    `<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#777"/></linearGradient></defs>
     <rect width="400" height="200" fill="url(#g)"/><rect x="300" y="80" width="40" height="40" fill="#222"/>`,
  );
  const before = await greyPixels(shaded);
  const after = await flattenLight(before);
  const at = (img, x, y) => img.data[y * img.width + x];
  assert.ok(at(before, 390, 10) < 140, 'the corner starts dark');
  assert.ok(at(after, 390, 10) > 225, `the corner is white after (${at(after, 390, 10)})`);
  assert.ok(at(after, 320, 100) < 120, 'the ink stays dark');
});

test('long thin lines (ruled paper) are rubbed out; writing and dark areas are kept', async () => {
  const ruled = await svg(
    600,
    300,
    `<rect width="600" height="300" fill="#fff"/>
     <rect x="0" y="100" width="600" height="3" fill="#333"/>
     <rect x="60" y="40" width="20" height="80" fill="#111"/>
     <rect x="0" y="220" width="600" height="80" fill="#111"/>`,
  );
  const out = removeRuledLines(await greyPixels(ruled));
  const at = (x, y) => out.data[y * out.width + x];
  assert.equal(at(300, 101), 255, 'the ruled line is gone');
  assert.ok(at(70, 60) < 50, 'a stroke of writing is kept');
  assert.ok(at(300, 260) < 50, 'a big dark area is not a line');
});

test('black and white at the Otsu level', () => {
  const data = Buffer.from([10, 20, 30, 200, 210, 220]);
  const t = otsu(data);
  assert.ok(t >= 30 && t < 200, `threshold ${t}`);
  assert.deepEqual([...binarize({ data, width: 6, height: 1 }).data], [0, 0, 0, 255, 255, 255]);
});
