import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { startTestApp } from './helpers.js';
import { GIF, heic, JPEG, PDF, PNG, SVG, TEXT, WEBP } from './samples.js';

const ME = '+447700900123';
const OTHER = '+447700900456';

async function withApp(fn, opts) {
  const app = await startTestApp(opts);
  try {
    await fn(app);
  } finally {
    await app.close();
  }
}

test('every invoice route refuses a visitor who is not signed in', () =>
  withApp(async (app) => {
    const id = '0'.repeat(32);
    assert.equal((await app.upload(null, JPEG)).status, 401);
    assert.equal((await app.call('GET', `/api/invoices/${id}`)).status, 401);
    assert.equal((await app.call('GET', `/api/invoices/${id}/image`)).status, 401);
    assert.equal((await app.call('DELETE', `/api/invoices/${id}`)).status, 401);
    // A made-up or expired token is no better than none.
    assert.equal((await app.upload('not-a-real-token', JPEG)).status, 401);
    assert.deepEqual(await readdir(app.uploadDir), [], 'nothing was written to disk');
  }));

test('an expired session cannot upload', () =>
  withApp(async (app) => {
    const token = await app.signIn(ME);
    app.advance(13 * 60 * 60 * 1000);
    assert.equal((await app.upload(token, JPEG)).status, 401);
  }));

test('upload accepts JPEG, PNG, WebP and HEIC and returns details', () =>
  withApp(async (app) => {
    const token = await app.signIn(ME);
    const cases = [
      [JPEG, 'image/jpeg'],
      [PNG, 'image/png'],
      [WEBP, 'image/webp'],
      [heic(), 'image/heic'],
      [heic('mif1'), 'image/heic'],
    ];
    for (const [data, mime] of cases) {
      const res = await app.upload(token, data);
      assert.equal(res.status, 201, mime);
      assert.equal(res.body.mimeType, mime);
      assert.equal(res.body.size, data.length);
      assert.match(res.body.id, /^[0-9a-f]{32}$/);
      assert.equal(res.body.imageUrl, `/api/invoices/${res.body.id}/image`);
      assert.ok(!Number.isNaN(Date.parse(res.body.createdAt)));
    }
  }));

test('the type comes from the bytes: a wrong file name or Content-Type changes nothing', () =>
  withApp(async (app) => {
    const token = await app.signIn(ME);
    const png = await app.upload(token, PNG, { filename: 'invoice.jpg', type: 'image/jpeg' });
    assert.equal(png.status, 201);
    assert.equal(png.body.mimeType, 'image/png');
    // A text file dressed up as an image is refused whatever it claims to be.
    const fake = await app.upload(token, TEXT, { filename: 'invoice.png', type: 'image/png' });
    assert.equal(fake.status, 415);
  }));

test('bad files are refused with 415: text, PDF, GIF and SVG', () =>
  withApp(async (app) => {
    const token = await app.signIn(ME);
    for (const [name, data] of Object.entries({ TEXT, PDF, GIF, SVG })) {
      const res = await app.upload(token, data);
      assert.equal(res.status, 415, name);
      assert.match(res.body.error, /JPEG, PNG, WebP or HEIC/, name);
    }
    assert.deepEqual(await readdir(app.uploadDir), [], 'refused files are never written');
  }));

test('an empty file, no file and the wrong field name are 400', () =>
  withApp(async (app) => {
    const token = await app.signIn(ME);
    const empty = await app.upload(token, Buffer.alloc(0));
    assert.equal(empty.status, 400);
    assert.match(empty.body.error, /empty/);
    const none = await app.upload(token, null);
    assert.equal(none.status, 400);
    assert.match(none.body.error, /Choose a picture/);
    const wrong = await app.upload(token, JPEG, { field: 'file' });
    assert.equal(wrong.status, 400);
    assert.match(wrong.body.error, /"image"/);
  }));

test('a JSON body or a broken multipart body is 400, not a crash', () =>
  withApp(async (app) => {
    const token = await app.signIn(ME);
    const json = await app.call('POST', '/api/invoices', { token, body: { image: 'x' } });
    assert.equal(json.status, 400);
    const res = await fetch(`${app.base}/api/invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      body: 'garbage',
    });
    assert.equal(res.status, 400);
    const broken = await fetch(`${app.base}/api/invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data; boundary=xyz',
      },
      body: '--xyz\r\nContent-Disposition: form-data; name="image"; filename="a.jpg"\r\n\r\nabc',
    });
    assert.equal(broken.status, 400);
  }));

test('more than one file in a request is refused', () =>
  withApp(async (app) => {
    const token = await app.signIn(ME);
    const form = new FormData();
    form.append('image', new Blob([JPEG]), 'a.jpg');
    form.append('image', new Blob([PNG]), 'b.png');
    const res = await fetch(`${app.base}/api/invoices`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await readdir(app.uploadDir), []);
  }));

test('the size limit is exact: at the limit is fine, one byte over is 413', () =>
  withApp(
    async (app) => {
      const token = await app.signIn(ME);
      const limit = 20_000; // UPLOAD_MAX_MB=0.019073486328125 is exactly 20,000 bytes
      const at = Buffer.concat([JPEG, Buffer.alloc(limit - JPEG.length)]);
      const over = Buffer.concat([JPEG, Buffer.alloc(limit + 1 - JPEG.length)]);
      assert.equal((await app.upload(token, at)).status, 201);
      const res = await app.upload(token, over);
      assert.equal(res.status, 413);
      assert.match(res.body.error, /too big/);
      assert.equal(
        (await app.call('GET', '/api/auth/me', { token })).status,
        200,
        'server still fine',
      );
    },
    { env: { UPLOAD_MAX_MB: String(20_000 / 1024 / 1024) } },
  ));

test('a far-too-large request is refused up front with 413', () =>
  withApp(
    async (app) => {
      const token = await app.signIn(ME);
      const huge = Buffer.concat([JPEG, Buffer.alloc(400_000)]);
      const res = await app.upload(token, huge);
      assert.equal(res.status, 413);
    },
    { env: { UPLOAD_MAX_MB: '0.01' } },
  ));

test('the default limit is 10 MB', () =>
  withApp(async (app) => {
    const token = await app.signIn(ME);
    const tenMb = 10 * 1024 * 1024;
    const at = Buffer.concat([PNG, Buffer.alloc(tenMb - PNG.length)]);
    assert.equal((await app.upload(token, at)).status, 201);
    const over = Buffer.concat([PNG, Buffer.alloc(tenMb + 1 - PNG.length)]);
    assert.equal((await app.upload(token, over)).status, 413);
  }));

test('a user can fetch their picture back, byte for byte, with safe headers', () =>
  withApp(async (app) => {
    const token = await app.signIn(ME);
    const { body } = await app.upload(token, PNG);
    const meta = await app.call('GET', `/api/invoices/${body.id}`, { token });
    assert.equal(meta.status, 200);
    assert.deepEqual(meta.body, body);
    const img = await app.fetchRaw(body.imageUrl, token);
    assert.equal(img.status, 200);
    assert.deepEqual(img.bytes, PNG);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
    assert.match(img.headers.get('cache-control'), /no-store/);
  }));

test('users cannot see, fetch or delete each other’s pictures (all 404)', () =>
  withApp(async (app) => {
    const mine = await app.signIn(ME);
    const theirs = await app.signIn(OTHER);
    const { body } = await app.upload(mine, JPEG);
    assert.equal(
      (await app.call('GET', `/api/invoices/${body.id}`, { token: theirs })).status,
      404,
    );
    assert.equal((await app.fetchRaw(body.imageUrl, theirs)).status, 404);
    assert.equal(
      (await app.call('DELETE', `/api/invoices/${body.id}`, { token: theirs })).status,
      404,
    );
    // The owner still has it.
    assert.equal((await app.fetchRaw(body.imageUrl, mine)).status, 200);
  }));

test('a user signing in again later still owns their pictures', () =>
  withApp(async (app) => {
    const first = await app.signIn(ME);
    const { body } = await app.upload(first, JPEG);
    await app.call('POST', '/api/auth/logout', { token: first });
    const second = await app.signIn(ME);
    assert.equal((await app.fetchRaw(body.imageUrl, second)).status, 200);
  }));

test('delete removes the picture; fetching or deleting it again is 404', () =>
  withApp(async (app) => {
    const token = await app.signIn(ME);
    const { body } = await app.upload(token, JPEG);
    const del = await app.call('DELETE', `/api/invoices/${body.id}`, { token });
    assert.deepEqual(del.body, { ok: true });
    assert.equal((await app.call('GET', `/api/invoices/${body.id}`, { token })).status, 404);
    assert.equal((await app.call('DELETE', `/api/invoices/${body.id}`, { token })).status, 404);
    const [owner] = await readdir(app.uploadDir);
    assert.deepEqual(await readdir(`${app.uploadDir}/${owner}`), []);
  }));

test('unknown and malformed ids are 404', () =>
  withApp(async (app) => {
    const token = await app.signIn(ME);
    for (const id of ['0'.repeat(32), 'nope', '..', '%2e%2e%2f', 'A'.repeat(32)]) {
      assert.equal((await app.call('GET', `/api/invoices/${id}`, { token })).status, 404, id);
      assert.equal((await app.call('GET', `/api/invoices/${id}/image`, { token })).status, 404, id);
      assert.equal((await app.call('DELETE', `/api/invoices/${id}`, { token })).status, 404, id);
    }
  }));

test('a user can keep only UPLOAD_MAX_PER_USER pictures; deleting one frees a slot', () =>
  withApp(
    async (app) => {
      const token = await app.signIn(ME);
      const other = await app.signIn(OTHER);
      const a = await app.upload(token, JPEG);
      await app.upload(token, JPEG);
      const full = await app.upload(token, JPEG);
      assert.equal(full.status, 429);
      assert.match(full.body.error, /up to 2 pictures/);
      assert.equal((await app.upload(other, JPEG)).status, 201, 'limit is per user');
      await app.call('DELETE', `/api/invoices/${a.body.id}`, { token });
      assert.equal((await app.upload(token, JPEG)).status, 201);
    },
    { env: { UPLOAD_MAX_PER_USER: '2' } },
  ));

test('stored file names never contain anything the client sent', () =>
  withApp(async (app) => {
    const token = await app.signIn(ME);
    const evil = '../../etc/passwd"; <script>.jpg';
    const res = await app.upload(token, JPEG, { filename: evil });
    assert.equal(res.status, 201);
    const [owner] = await readdir(app.uploadDir);
    assert.deepEqual(await readdir(`${app.uploadDir}/${owner}`), [`${res.body.id}.jpg`]);
  }));

test('upload settings have safe defaults and can be changed from the environment', async () => {
  const { loadConfig } = await import('../src/config.js');
  const d = loadConfig({}).uploads;
  assert.equal(d.maxBytes, 10 * 1024 * 1024);
  assert.equal(d.ttlMs, 24 * 60 * 60 * 1000);
  assert.equal(d.maxPerUser, 50);
  assert.match(d.dir, /server[\\/]uploads$/);
  const c = loadConfig({
    UPLOAD_DIR: '/data/pics',
    UPLOAD_MAX_MB: '2.5',
    UPLOAD_TTL_HOURS: '1',
    UPLOAD_MAX_PER_USER: '7',
  }).uploads;
  assert.deepEqual(c, {
    dir: '/data/pics',
    maxBytes: 2.5 * 1024 * 1024,
    ttlMs: 3600_000,
    maxPerUser: 7,
  });
  // Nonsense values fall back to the defaults instead of disabling the limit.
  const bad = loadConfig({
    UPLOAD_MAX_MB: '-1',
    UPLOAD_TTL_HOURS: 'abc',
    UPLOAD_MAX_PER_USER: '0',
  }).uploads;
  assert.equal(bad.maxBytes, 10 * 1024 * 1024);
  assert.equal(bad.ttlMs, 24 * 60 * 60 * 1000);
  assert.equal(bad.maxPerUser, 50);
});
