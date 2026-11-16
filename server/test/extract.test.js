import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { startTestApp } from './helpers.js';
import { ExtractionError } from '../src/extraction/errors.js';
import { heic, JPEG } from './samples.js';

const ME = '+447700900123';
const OTHER = '+447700900456';

const ANSWER = {
  readable: true,
  debit: '1,250.50',
  credit: '400',
  confidence: 'high',
  notes: 'Clear photo.',
  line_items: [
    { description: 'Parts', column: 'debit', amount: '1000.50' },
    { description: 'Labour', column: 'debit', amount: '250.00' },
    { description: 'Deposit', column: 'credit', amount: '400.00' },
  ],
};

// A real, tiny PNG so the default image step (sharp) has something to open.
const png = (colour = '#fff') =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: colour } })
    .png()
    .toBuffer();

// A fake AI that records what it was given. `answer` can be a value or a function.
function fakeVision(answer = ANSWER) {
  const calls = [];
  return {
    calls,
    name: 'fake',
    model: 'fake-1',
    async extract(input) {
      calls.push(input);
      const out = typeof answer === 'function' ? await answer(input) : answer;
      return out;
    },
  };
}

async function withApp(fn, opts = {}) {
  const quiet = mock.method(console, 'error', () => {});
  const app = await startTestApp(opts);
  try {
    await fn(app);
  } finally {
    await app.close();
    quiet.mock.restore();
  }
}

const extract = (app, token, id) => app.call('POST', `/api/invoices/${id}/extract`, { token });
const files = async (app) =>
  (await readdir(app.uploadDir, { recursive: true, withFileTypes: true })).filter((e) =>
    e.isFile(),
  );

async function uploaded(app, token, bytes) {
  const res = await app.upload(token, bytes ?? (await png()), {
    filename: 'inv.png',
    type: 'image/png',
  });
  assert.equal(res.status, 201);
  return res.body.id;
}

test('extracting needs a signed-in user', () =>
  withApp(async (app) => {
    const res = await extract(app, null, '0'.repeat(32));
    assert.equal(res.status, 401);
  }));

test('a good picture returns exact amounts, items and warnings, then the picture is deleted', () => {
  const vision = fakeVision();
  return withApp(
    async (app) => {
      const token = await app.signIn(ME);
      const id = await uploaded(app, token);
      assert.equal((await files(app)).length, 1);

      const res = await extract(app, token, id);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, {
        invoiceId: id,
        provider: 'fake',
        model: 'fake-1',
        imageDeleted: true,
        debit: '1250.50',
        credit: '400.00',
        currency: 'INR',
        confidence: 'high',
        notes: 'Clear photo.',
        warnings: [],
        lineItems: [
          { description: 'Parts', column: 'debit', amount: '1000.50' },
          { description: 'Labour', column: 'debit', amount: '250.00' },
          { description: 'Deposit', column: 'credit', amount: '400.00' },
        ],
        itemTotals: { debit: '1250.50', credit: '400.00' },
      });

      // AI-4: nothing of the picture is left once it has been read.
      assert.deepEqual(await files(app), []);
      assert.equal((await app.call('GET', `/api/invoices/${id}`, { token })).status, 404);
      assert.equal((await app.fetchRaw(`/api/invoices/${id}/image`, token)).status, 404);
      assert.equal((await extract(app, token, id)).status, 404);

      // The AI got a JPEG and the original bytes as its fingerprint.
      assert.equal(vision.calls.length, 1);
      assert.equal(vision.calls[0].image.mediaType, 'image/jpeg');
      assert.ok(Buffer.isBuffer(vision.calls[0].fingerprint));
    },
    { vision },
  );
});

test('the mock reader answers the same way for the same picture', () =>
  withApp(
    async (app) => {
      const token = await app.signIn(ME);
      const bytes = await png('#fafafa');
      const first = (await extract(app, token, await uploaded(app, token, bytes))).body;
      const second = (await extract(app, token, await uploaded(app, token, bytes))).body;
      const other = (await extract(app, token, await uploaded(app, token, await png('#101010'))))
        .body;
      assert.equal(first.provider, 'mock');
      assert.match(first.debit, /^\d+\.\d\d$/);
      assert.equal(first.currency, 'INR'); // rupees only
      assert.deepEqual({ ...first, invoiceId: 0 }, { ...second, invoiceId: 0 });
      assert.notEqual(first.debit, other.debit);
      assert.equal((await app.call('GET', '/api/health')).body.providers.vision, 'mock');
    },
    { env: { VISION_PROVIDER: 'mock' } },
  ));

test("ids that are unknown, malformed or someone else's are all 404 and never reach the AI", () => {
  const vision = fakeVision();
  return withApp(
    async (app) => {
      const mine = await app.signIn(ME);
      const theirs = await app.signIn(OTHER);
      const id = await uploaded(app, mine);
      for (const bad of ['0'.repeat(32), 'nope', '..%2F..%2Fetc', id.toUpperCase()]) {
        assert.equal((await extract(app, theirs, bad)).status, 404, bad);
      }
      assert.equal((await extract(app, theirs, id)).status, 404);
      assert.equal(vision.calls.length, 0);
      assert.equal((await files(app)).length, 1, 'their attempt did not touch my picture');
      assert.equal((await extract(app, mine, id)).status, 200);
    },
    { vision },
  );
});

test('when the AI fails the picture is kept so the user can try again', () => {
  let attempt = 0;
  const vision = fakeVision(() => {
    attempt += 1;
    if (attempt === 1)
      throw new ExtractionError('timeout', 'Reading the invoice took too long. Please try again.', {
        status: 504,
        cause: new Error('socket secret-detail'),
      });
    return ANSWER;
  });
  return withApp(
    async (app) => {
      const token = await app.signIn(ME);
      const id = await uploaded(app, token);
      const failed = await extract(app, token, id);
      assert.equal(failed.status, 504);
      assert.deepEqual(failed.body, {
        error: 'Reading the invoice took too long. Please try again.',
        code: 'timeout',
      });
      assert.doesNotMatch(JSON.stringify(failed.body), /secret-detail/);
      assert.equal((await files(app)).length, 1);
      assert.equal((await app.call('GET', `/api/invoices/${id}`, { token })).status, 200);

      const retried = await extract(app, token, id);
      assert.equal(retried.status, 200);
      assert.deepEqual(await files(app), []);
    },
    { vision },
  );
});

test('a busy AI service is a 429 with a Retry-After the page can show', () =>
  withApp(
    async (app) => {
      const token = await app.signIn(ME);
      const id = await uploaded(app, token);
      const res = await extract(app, token, id);
      assert.equal(res.status, 429);
      assert.equal(res.headers.get('retry-after'), '17');
      assert.equal(res.body.retryAfterSeconds, 17);
      assert.equal(res.body.code, 'rate_limited');
      assert.equal((await files(app)).length, 1);
    },
    {
      vision: fakeVision(() => {
        throw new ExtractionError('rate_limited', 'The AI service is busy right now.', {
          status: 429,
          retryAfterSeconds: 17,
        });
      }),
    },
  ));

test('unreadable invoices, unreadable files and unusable answers are reported, and kept', async () => {
  const cases = [
    {
      name: 'model says the picture is not readable',
      vision: fakeVision({ ...ANSWER, readable: false, debit: null, credit: null, line_items: [] }),
      status: 422,
      code: 'unreadable_invoice',
    },
    {
      name: 'model answers with the wrong shape',
      vision: fakeVision({ debit: 5 }),
      status: 502,
      code: 'bad_model_output',
    },
    {
      name: 'provider crashes with something unexpected',
      vision: fakeVision(() => {
        throw new TypeError('kaboom');
      }),
      status: 502,
      code: 'provider_unavailable',
    },
  ];
  for (const c of cases) {
    await withApp(
      async (app) => {
        const token = await app.signIn(ME);
        const id = await uploaded(app, token);
        const res = await extract(app, token, id);
        assert.equal(res.status, c.status, c.name);
        assert.equal(res.body.code, c.code, c.name);
        assert.equal(typeof res.body.error, 'string');
        assert.equal((await files(app)).length, 1, c.name);
      },
      { vision: c.vision },
    );
  }
});

test('a file that looks like a picture but cannot be opened is a 422 and is kept', () => {
  const vision = fakeVision();
  return withApp(
    async (app) => {
      const token = await app.signIn(ME);
      const id = await uploaded(app, token, JPEG); // right first bytes, nothing real behind them
      const res = await extract(app, token, id);
      assert.equal(res.status, 422);
      assert.equal(res.body.code, 'unreadable_image');
      assert.equal(vision.calls.length, 0, 'nothing is sent to the AI');
      assert.equal((await files(app)).length, 1);
    },
    { vision },
  );
});

test('HEIC pictures go through the image step as HEIC and reach the AI as JPEG', () => {
  const vision = fakeVision();
  const seen = [];
  const prepare = async (data, mimeType) => {
    seen.push(mimeType);
    return { data: Buffer.from('converted jpeg'), mediaType: 'image/jpeg' };
  };
  return withApp(
    async (app) => {
      const token = await app.signIn(ME);
      const res = await app.upload(token, heic(), {
        filename: 'IMG_0001.HEIC',
        type: 'image/heic',
      });
      assert.equal(res.status, 201);
      assert.equal((await extract(app, token, res.body.id)).status, 200);
      assert.deepEqual(seen, ['image/heic']);
      assert.equal(vision.calls[0].image.mediaType, 'image/jpeg');
      assert.equal(vision.calls[0].image.data.toString(), 'converted jpeg');
    },
    { vision, prepare },
  );
});

test('the same picture cannot be read twice at once', () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const vision = fakeVision(async () => {
    await gate;
    return ANSWER;
  });
  return withApp(
    async (app) => {
      const token = await app.signIn(ME);
      const id = await uploaded(app, token);
      const first = extract(app, token, id);
      // Wait until the first call is inside the AI.
      while (vision.calls.length === 0) await new Promise((r) => setTimeout(r, 5));
      const second = await extract(app, token, id);
      assert.equal(second.status, 409);
      release();
      assert.equal((await first).status, 200);
      assert.equal(vision.calls.length, 1);
    },
    { vision },
  );
});

test('each user can start a limited number of readings per hour', () => {
  const vision = fakeVision();
  return withApp(
    async (app) => {
      const token = await app.signIn(ME);
      const other = await app.signIn(OTHER);
      for (let i = 0; i < 2; i += 1) {
        assert.equal(
          (await extract(app, token, await uploaded(app, token, await png(`#00000${i}`)))).status,
          200,
        );
      }
      const id = await uploaded(app, token);
      const blocked = await extract(app, token, id);
      assert.equal(blocked.status, 429);
      assert.ok(Number(blocked.headers.get('retry-after')) > 0);
      assert.equal(vision.calls.length, 2);
      assert.equal((await files(app)).length, 1, 'the blocked picture is kept');

      // Someone else is not affected, and the limit lifts after the hour.
      assert.equal((await extract(app, other, await uploaded(app, other))).status, 200);
      app.advance(61 * 60 * 1000);
      const again = await app.signIn(ME);
      assert.equal((await extract(app, again, id)).status, 200);
    },
    { vision, env: { EXTRACT_PER_USER_PER_HOUR: '2' } },
  );
});

test('if the browser goes away the AI call is stopped and the picture is kept', () => {
  let started;
  const begun = new Promise((resolve) => (started = resolve));
  let aborted = false;
  const vision = fakeVision(
    ({ signal }) =>
      new Promise((_resolve, reject) => {
        started();
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new ExtractionError('cancelled', 'cancelled', { status: 499 }));
        });
      }),
  );
  return withApp(
    async (app) => {
      const token = await app.signIn(ME);
      const id = await uploaded(app, token);
      const controller = new AbortController();
      const pending = fetch(`${app.base}/api/invoices/${id}/extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }).catch((err) => err);
      await begun;
      controller.abort();
      await pending;
      for (let i = 0; i < 100 && !aborted; i += 1) await new Promise((r) => setTimeout(r, 10));
      assert.equal(aborted, true);
      assert.equal((await files(app)).length, 1);
      // The picture is free to be read again afterwards.
      vision.extract = async () => ANSWER;
      assert.equal((await extract(app, token, id)).status, 200);
    },
    { vision },
  );
});
