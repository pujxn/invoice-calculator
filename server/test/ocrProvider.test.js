import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createExtractor } from '../src/extraction/index.js';
import { ExtractionError } from '../src/extraction/errors.js';
import {
  createOcrEngine,
  createOcrProvider,
  estimateSkew,
} from '../src/extraction/providers/ocr.js';
import { createFallbackProvider, USED_PROVIDER } from '../src/extraction/providers/fallback.js';

const demo = (name) => path.resolve(import.meta.dirname, '../../docs/demo', name);
const fixture = (name) => path.resolve(import.meta.dirname, 'fixtures/ocr', name);
const mimeOf = (file) => (file.endsWith('.png') ? 'image/png' : 'image/jpeg');

// ---- the real engine, on real pictures (offline: the language data is bundled) ----------------

const provider = createOcrProvider();
const extractor = createExtractor({ provider });
after(() => provider.close());

async function read(file) {
  return extractor.extract({ data: await readFile(file), mimeType: mimeOf(file) });
}

// Only the printed Debit and Credit amounts are read, as plain numbers (no currency sign). OCR
// cannot prove an amount, so it never reports "high" and always asks the user to check.
const ASK = /check each amount against your picture/;

test('demo invoice 1 (net debit): both amounts, at medium confidence with a check note', async () => {
  const r = await read(demo('demo-1-net-debit.png'));
  assert.deepEqual([r.debit, r.credit, r.confidence], ['125050.00', '40000.00', 'medium']);
  assert.equal('lineItems' in r, false);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.currency, 'INR');
  assert.match(r.notes, ASK);
});

test('demo invoice 2 (net credit, lakh grouping 1,12,575.00)', async () => {
  const r = await read(demo('demo-2-net-credit.png'));
  assert.deepEqual([r.debit, r.credit, r.confidence], ['30000.00', '112575.00', 'medium']);
});

test('demo invoice 3 (balanced): the same amount on both sides', async () => {
  const r = await read(demo('demo-3-balanced.png'));
  assert.deepEqual([r.debit, r.credit, r.confidence], ['64000.00', '64000.00', 'medium']);
});

test('demo invoice 4 (tilted, blurry photo on a dark desk)', async () => {
  const r = await read(demo('demo-4-tricky-blurry.jpg'));
  assert.deepEqual([r.debit, r.credit, r.confidence], ['248025.00', '91500.00', 'medium']);
});

test('a plain note with no table: both amounts, at medium confidence', async () => {
  const r = await read(fixture('plain-text.png'));
  assert.deepEqual([r.debit, r.credit, r.confidence], ['12500.50', '3200.00', 'medium']);
  assert.match(r.notes, ASK);
});

test('DEBIT - Rs. 45,000/- and lakh grouping, no decimals', async () => {
  const r = await read(fixture('rs-slash.png'));
  assert.deepEqual([r.debit, r.credit], ['45000.00', '125000.00']);
});

test('only a Debit amount: Credit stays empty and the notes say it was not found', async () => {
  const r = await read(fixture('debit-only.png'));
  assert.equal(r.debit, '1650.50');
  assert.equal(r.credit, null);
  assert.equal(r.confidence, 'medium');
  assert.match(r.notes, /No Credit label/);
});

test('a picture with no Debit or Credit is "not an invoice", not a made-up answer', async () => {
  await assert.rejects(
    () => read(fixture('not-an-invoice.png')),
    (err) => err instanceof ExtractionError && err.code === 'unreadable_invoice',
  );
});

test('a picture turned upside down or on its side is turned back before reading', async () => {
  const upright = await readFile(demo('demo-2-net-credit.png'));
  for (const turn of [180, 90, 270]) {
    const data = await sharp(upright).rotate(turn).png().toBuffer();
    const r = await extractor.extract({ data, mimeType: 'image/png' });
    assert.deepEqual([r.debit, r.credit], ['30000.00', '112575.00'], `${turn}`);
    assert.equal(r.confidence, 'medium');
  }
});

test('a degraded photo is still read: blurred, heavily compressed, small, tilted, dark', async () => {
  const raw = await readFile(demo('demo-1-net-debit.png'));
  const meta = await sharp(raw).metadata();
  const variants = {
    blurred: sharp(raw).blur(1.6),
    'jpeg quality 25': sharp(raw).jpeg({ quality: 25 }),
    'half size': sharp(raw).resize({ width: Math.round(meta.width / 2) }),
    'tilted 6 degrees': sharp(raw).rotate(-6, { background: '#fff' }),
    'dark, low contrast': sharp(raw).linear(0.45, 25),
  };
  for (const [name, image] of Object.entries(variants)) {
    const data = await image.png().toBuffer();
    const r = await extractor.extract({ data, mimeType: 'image/png' });
    assert.deepEqual([r.debit, r.credit], ['125050.00', '40000.00'], name);
  }
});

test('so much noise that nothing can be read is "not an invoice", never a wrong number', async () => {
  const raw = await readFile(demo('demo-1-net-debit.png'));
  const { width, height } = await sharp(raw).metadata();
  const noise = await sharp({
    create: { width, height, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 45 } },
  })
    .png()
    .toBuffer();
  const data = await sharp(raw)
    .composite([{ input: noise, blend: 'multiply' }])
    .png()
    .toBuffer();
  try {
    const r = await extractor.extract({ data, mimeType: 'image/png' });
    if (r.debit !== null) assert.equal(r.debit, '125050.00');
    if (r.credit !== null) assert.equal(r.credit, '40000.00');
  } catch (err) {
    assert.ok(err instanceof ExtractionError && err.code === 'unreadable_invoice', String(err));
  }
});

test('a straight page is left alone and a tilted one is measured', async () => {
  assert.equal(await estimateSkew(await readFile(demo('demo-1-net-debit.png'))), 0);
  const tilt = await estimateSkew(await readFile(demo('demo-4-tricky-blurry.jpg')));
  assert.ok(tilt >= 1 && tilt <= 3, `tilt was ${tilt}`);
});

// ---- the worker manager, with a fake worker --------------------------------------------------

function fakeWorkers({ job = async () => ({ data: { blocks: [] } }) } = {}) {
  const log = { made: 0, terminated: 0, running: 0, maxRunning: 0, recognized: 0 };
  const make = async () => {
    log.made += 1;
    return {
      async setParameters() {},
      async recognize(...args) {
        log.running += 1;
        log.recognized += 1;
        log.maxRunning = Math.max(log.maxRunning, log.running);
        try {
          return await job(...args);
        } finally {
          log.running -= 1;
        }
      },
      async terminate() {
        log.terminated += 1;
      },
    };
  };
  return { make, log };
}
const engineWith = (fake, opts = {}) =>
  createOcrEngine({ makeWorker: fake.make, lang: { langPath: '/x', gzip: true }, ...opts });

test('the engine starts only when first needed and reuses its worker', async () => {
  const fake = fakeWorkers();
  const engine = engineWith(fake);
  assert.equal(fake.log.made, 0);
  await engine.run(async () => 1);
  await engine.run(async () => 2);
  assert.equal(fake.log.made, 1);
  await engine.stop();
  assert.equal(fake.log.terminated, 1);
});

test('a reading that takes too long is cut off, the worker is replaced, and the next one works', async () => {
  const fake = fakeWorkers();
  const engine = engineWith(fake, { timeoutMs: 30 });
  await assert.rejects(
    () => engine.run(() => new Promise(() => {})),
    (err) => err.code === 'timeout' && err.status === 504,
  );
  assert.equal(fake.log.terminated, 1);
  assert.equal(await engine.run(async () => 'fine'), 'fine');
  assert.equal(fake.log.made, 2);
  await engine.stop();
});

test('cancelling stops the worker and reports it as cancelled', async () => {
  const fake = fakeWorkers();
  const engine = engineWith(fake);
  const controller = new AbortController();
  const pending = engine.run(() => new Promise(() => {}), { signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(
    () => pending,
    (err) => err.code === 'cancelled' && err.status === 499,
  );
  await assert.rejects(
    () => engine.run(async () => 1, { signal: controller.signal }),
    (err) => err.code === 'cancelled',
  );
  await engine.stop();
});

test('readings run one at a time and only a few may wait', async () => {
  const fake = fakeWorkers();
  const engine = engineWith(fake, { maxWaiting: 2 });
  const slow = () => new Promise((r) => setTimeout(r, 30));
  const jobs = [engine.run(slow), engine.run(slow)];
  await assert.rejects(
    () => engine.run(slow),
    (err) => err.code === 'rate_limited' && err.status === 429 && err.retryAfterSeconds > 0,
  );
  await Promise.all(jobs);
  assert.equal(fake.log.maxRunning <= 1, true);
  await engine.stop();
});

test('an idle worker is stopped to free its memory', async () => {
  const fake = fakeWorkers();
  const engine = engineWith(fake, { idleMs: 20 });
  await engine.run(async () => 1);
  assert.equal(fake.log.terminated, 0);
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(fake.log.terminated, 1);
});

test('an engine failure becomes a plain error, not a stack trace', async () => {
  const fake = fakeWorkers();
  const engine = engineWith(fake);
  await assert.rejects(
    () => engine.run(async () => Promise.reject(new Error('wasm exploded: /secret/path'))),
    (err) =>
      err instanceof ExtractionError &&
      err.code === 'provider_unavailable' &&
      !/secret/.test(err.message),
  );
  await engine.stop();
});

test('the provider stops once two readings agree on both amounts', async () => {
  const words = [
    ['Debit:', 10, 300],
    ['100.00', 400, 300],
    ['Credit:', 10, 360],
    ['100.00', 400, 360],
  ].map(([text, x, y]) => ({
    text,
    confidence: 95,
    bbox: { x0: x, y0: y - 12, x1: x + (text.length > 6 ? 120 : 90), y1: y + 12 },
  }));
  const fake = fakeWorkers({
    job: async () => ({
      data: { blocks: [{ paragraphs: [{ lines: [{ words }] }] }] },
    }),
  });
  const p = createOcrProvider({ engine: engineWith(fake) });
  const image = {
    data: await sharp({ create: { width: 600, height: 500, channels: 3, background: '#fff' } })
      .jpeg()
      .toBuffer(),
  };
  const out = await p.extract({ image });
  assert.deepEqual(
    [out.readable, out.debit, out.credit, out.confidence],
    [true, '100.00', '100.00', 'medium'],
  );
  assert.equal(fake.log.recognized, 2, 'two readings agreed, so the third was skipped');
  await p.close();
});

// ---- OCR first, AI second ---------------------------------------------------------------------

const answer = (over = {}) => ({
  readable: true,
  debit: '10.00',
  credit: '5.00',
  confidence: 'high',
  notes: '',
  ...over,
});
const stub = (name, reply) => ({
  name,
  model: `${name}-1`,
  calls: 0,
  async extract() {
    this.calls += 1;
    if (reply instanceof Error) throw reply;
    return reply;
  },
});

test('fallback: a confident OCR answer is used and the AI is never called', async () => {
  const ocr = stub('ocr', answer());
  const claude = stub('claude', answer({ debit: '99.00' }));
  const out = await createFallbackProvider({ primary: ocr, secondary: claude }).extract({});
  assert.equal(out.debit, '10.00');
  assert.equal(claude.calls, 0);
});

test('fallback: an unsure OCR answer (low confidence, nothing found, or an error) goes to the AI', async () => {
  for (const first of [
    answer({ confidence: 'low' }),
    answer({ debit: null, credit: null, confidence: 'medium' }),
    answer({ readable: false }),
    new ExtractionError('timeout', 'slow', { status: 504 }),
  ]) {
    const claude = stub('claude', answer({ debit: '99.00', notes: 'Clear.' }));
    const out = await createFallbackProvider({
      primary: stub('ocr', first),
      secondary: claude,
    }).extract({});
    assert.equal(out.debit, '99.00');
    assert.match(out.notes, /Read by AI because/);
    assert.deepEqual(out[USED_PROVIDER], { name: 'claude', model: 'claude-1' });
    assert.equal(Object.keys(out).includes(USED_PROVIDER.toString()), false);
  }
});

test('fallback: if the AI fails too, a cautious OCR answer is kept; otherwise the error stands', async () => {
  const boom = new ExtractionError('provider_unavailable', 'AI down', { status: 502 });
  const kept = await createFallbackProvider({
    primary: stub('ocr', answer({ confidence: 'low', debit: null })),
    secondary: stub('claude', boom),
  }).extract({});
  assert.equal(kept.confidence, 'low');
  await assert.rejects(
    () =>
      createFallbackProvider({
        primary: stub('ocr', answer({ readable: false })),
        secondary: stub('claude', boom),
      }).extract({}),
    /AI down/,
  );
});

test('fallback: a cancelled reading does not start the AI', async () => {
  const controller = new AbortController();
  controller.abort();
  const claude = stub('claude', answer());
  await assert.rejects(() =>
    createFallbackProvider({
      primary: stub('ocr', new ExtractionError('cancelled', 'x', { status: 499 })),
      secondary: claude,
    }).extract({ signal: controller.signal }),
  );
  assert.equal(claude.calls, 0);
});
