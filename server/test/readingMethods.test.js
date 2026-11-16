import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { startTestApp } from './helpers.js';
import { createVisionMethods, createVisionProvider } from '../src/extraction/index.js';
import { loadConfig } from '../src/config.js';

const ME = '+447700900123';
const answer = (debit, notes) => ({
  readable: true,
  debit,
  credit: null,
  confidence: 'high',
  notes,
  line_items: [],
});
const reader = (name, debit) => ({
  name,
  model: `${name}-1`,
  calls: 0,
  async extract() {
    this.calls += 1;
    return answer(debit, `from ${name}`);
  },
});
const png = () =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: '#fff' } })
    .png()
    .toBuffer();

async function withApp(opts, fn) {
  const quiet = mock.method(console, 'error', () => {});
  const app = await startTestApp(opts);
  try {
    await fn(app);
  } finally {
    await app.close();
    quiet.mock.restore();
  }
}
const upload = async (app, token) =>
  (await app.upload(token, await png(), { filename: 'i.png', type: 'image/png' })).body.id;
const read = (app, token, id, body) =>
  app.call('POST', `/api/invoices/${id}/extract`, { token, body });

const both = () => {
  const ocr = reader('ocr', '1.00');
  const claude = reader('claude', '2.00');
  return {
    ocr,
    claude,
    visionMethods: [
      { id: 'ocr', label: 'Local OCR', available: true, provider: ocr, default: true },
      { id: 'claude', label: 'AI (Claude)', available: true, provider: claude },
    ],
  };
};

test('the methods list needs sign-in and says which are available', async () => {
  const { visionMethods } = both();
  await withApp({ visionMethods }, async (app) => {
    assert.equal((await app.call('GET', '/api/invoices/reading-methods')).status, 401);
    const token = await app.signIn(ME);
    const res = await app.call('GET', '/api/invoices/reading-methods', { token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, {
      default: 'ocr',
      methods: [
        { id: 'ocr', label: 'Local OCR', available: true },
        { id: 'claude', label: 'AI (Claude)', available: true },
      ],
    });
  });
});

test('the reader named in the request is the one used; with none named, the default', async () => {
  const { ocr, claude, visionMethods } = both();
  await withApp({ visionMethods }, async (app) => {
    const token = await app.signIn(ME);
    const byDefault = await read(app, token, await upload(app, token));
    assert.equal(byDefault.body.provider, 'ocr');
    assert.equal(byDefault.body.debit, '1.00');
    const byAi = await read(app, token, await upload(app, token), { method: 'claude' });
    assert.equal(byAi.body.provider, 'claude');
    assert.equal(byAi.body.debit, '2.00');
    const byOcr = await read(app, token, await upload(app, token), { method: 'ocr' });
    assert.equal(byOcr.body.provider, 'ocr');
    assert.deepEqual([ocr.calls, claude.calls], [2, 1]);
  });
});

test('a method that is not set up is refused politely and the picture is kept', async () => {
  const ocr = reader('ocr', '1.00');
  const visionMethods = [
    { id: 'ocr', label: 'Local OCR', available: true, provider: ocr, default: true },
    {
      id: 'claude',
      label: 'AI (Claude)',
      available: false,
      reason: 'AI reading is not set up on this server (no ANTHROPIC_API_KEY).',
    },
  ];
  await withApp({ visionMethods }, async (app) => {
    const token = await app.signIn(ME);
    const list = await app.call('GET', '/api/invoices/reading-methods', { token });
    assert.deepEqual(list.body.methods[1], {
      id: 'claude',
      label: 'AI (Claude)',
      available: false,
      reason: 'AI reading is not set up on this server (no ANTHROPIC_API_KEY).',
    });
    const id = await upload(app, token);
    const res = await read(app, token, id, { method: 'claude' });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'method_unavailable');
    assert.match(res.body.error, /no ANTHROPIC_API_KEY/);
    assert.equal(
      (await app.call('GET', `/api/invoices/${id}`, { token })).status,
      200,
      'picture kept',
    );
    assert.equal((await read(app, token, id, { method: 'ocr' })).status, 200);
  });
});

test('unknown or malformed methods are a 400 and never reach a reader', async () => {
  const { ocr, claude, visionMethods } = both();
  await withApp({ visionMethods }, async (app) => {
    const token = await app.signIn(ME);
    const id = await upload(app, token);
    for (const method of [
      'gpt',
      '',
      'OCR ',
      '__proto__',
      'constructor',
      5,
      ['ocr'],
      { id: 'ocr' },
    ]) {
      const res = await read(app, token, id, { method });
      assert.equal(res.status, 400, JSON.stringify(method));
    }
    assert.deepEqual([ocr.calls, claude.calls], [0, 0]);
  });
});

test('config: without a key AI is listed as unavailable; with one it is offered', () => {
  const none = createVisionMethods(loadConfig({}).vision);
  assert.equal(none.default, 'ocr');
  assert.deepEqual(
    none.methods.map((m) => [m.id, m.available]),
    [
      ['ocr', true],
      ['claude', false],
    ],
  );
  assert.match(none.methods[1].reason, /ANTHROPIC_API_KEY/);
  assert.equal(none.methods[1].provider, undefined);

  const keyed = createVisionMethods(loadConfig({ ANTHROPIC_API_KEY: 'sk-test' }).vision);
  assert.equal(keyed.default, 'claude');
  assert.deepEqual(
    keyed.methods.map((m) => [m.id, m.available]),
    [
      ['ocr', true],
      ['claude', true],
    ],
  );
  const keyedOcr = createVisionMethods(
    loadConfig({ ANTHROPIC_API_KEY: 'sk-test', VISION_PROVIDER: 'ocr' }).vision,
  );
  assert.equal(keyedOcr.default, 'ocr');

  // Demo values (the automated tests' mode) stand alone: nothing to switch between.
  const mockOnly = createVisionMethods(loadConfig({ VISION_PROVIDER: 'mock' }).vision);
  assert.deepEqual(
    mockOnly.methods.map((m) => m.id),
    ['mock'],
  );

  assert.throws(
    () => createVisionMethods(loadConfig({ VISION_PROVIDER: 'claude' }).vision),
    /ANTHROPIC_API_KEY/,
  );
  assert.throws(
    () => createVisionMethods(loadConfig({ VISION_PROVIDER: 'nope' }).vision),
    /Unknown VISION_PROVIDER/,
  );
});

test('OCR_FALLBACK_TO_CLAUDE puts the AI behind the OCR only when a key is set', () => {
  const plain = createVisionProvider(loadConfig({ VISION_PROVIDER: 'ocr' }).vision);
  const noKey = createVisionProvider(
    loadConfig({ VISION_PROVIDER: 'ocr', OCR_FALLBACK_TO_CLAUDE: '1' }).vision,
  );
  const keyed = createVisionProvider(
    loadConfig({
      VISION_PROVIDER: 'ocr',
      OCR_FALLBACK_TO_CLAUDE: '1',
      ANTHROPIC_API_KEY: 'sk-test',
    }).vision,
  );
  for (const p of [plain, noKey, keyed]) assert.equal(p.name, 'ocr');
  // The fallback wrapper reports the same name; only it can stand in for another reader.
  assert.equal(typeof keyed.close, 'function');
});

test('without a key the real server answers /reading-methods with AI unavailable', async () => {
  await withApp({}, async (app) => {
    const token = await app.signIn(ME);
    const res = await app.call('GET', '/api/invoices/reading-methods', { token });
    assert.equal(res.body.default, 'ocr');
    assert.equal(res.body.methods.find((m) => m.id === 'claude').available, false);
    const refused = await read(app, token, await upload(app, token), { method: 'claude' });
    assert.equal(refused.status, 409);
  });
});
