import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createUploadStore, isValidId } from '../src/invoices/store.js';
import { IMAGE_TYPES } from '../src/invoices/fileType.js';
import { JPEG, PNG } from './samples.js';

async function withStore(fn, opts = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'store-'));
  try {
    await fn(createUploadStore({ dir, ttlMs: 60_000, maxPerUser: 3, ...opts }), dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('save then get returns the same bytes and details', () =>
  withStore(async (store) => {
    const saved = await store.save('+447700900123', JPEG, IMAGE_TYPES.jpeg);
    assert.match(saved.id, /^[0-9a-f]{32}$/);
    assert.equal(saved.mimeType, 'image/jpeg');
    assert.equal(saved.size, JPEG.length);
    assert.ok(!Number.isNaN(Date.parse(saved.createdAt)));
    assert.ok(!('file' in saved), 'the disk path is not part of the public details');
    const read = await store.read('+447700900123', saved.id);
    assert.deepEqual(read.data, JPEG);
  }));

test('files are stored under a hashed owner folder with a random name, mode 600', () =>
  withStore(async (store, dir) => {
    const saved = await store.save('+447700900123', PNG, IMAGE_TYPES.png);
    const folders = await readdir(dir);
    assert.equal(folders.length, 1);
    assert.ok(!folders[0].includes('7700900123'), 'phone number is not in the path');
    assert.deepEqual(await readdir(path.join(dir, folders[0])), [`${saved.id}.png`]);
    const info = await stat(path.join(dir, folders[0], `${saved.id}.png`));
    assert.equal(info.mode & 0o777, 0o600);
  }));

test('one owner cannot read, count or delete another owner’s files', () =>
  withStore(async (store) => {
    const mine = await store.save('+441', JPEG, IMAGE_TYPES.jpeg);
    assert.equal(await store.get('+442', mine.id), null);
    assert.equal(await store.remove('+442', mine.id), false);
    assert.equal(await store.count('+442'), 0);
    assert.equal(await store.count('+441'), 1);
    assert.ok(await store.get('+441', mine.id));
  }));

test('malformed ids are rejected, including path traversal attempts', () =>
  withStore(async (store) => {
    await store.save('+441', JPEG, IMAGE_TYPES.jpeg);
    for (const bad of [
      '../x',
      '..%2f..',
      'abc',
      '',
      null,
      undefined,
      'a'.repeat(32),
      '0'.repeat(31),
    ]) {
      assert.equal(await store.get('+441', bad), null, String(bad));
      assert.equal(await store.remove('+441', bad), false, String(bad));
    }
    assert.equal(isValidId('0123456789abcdef0123456789abcdef'), true);
    assert.equal(isValidId('0123456789ABCDEF0123456789abcdef'), false);
  }));

test('remove deletes the file and a second remove says so', () =>
  withStore(async (store) => {
    const { id } = await store.save('+441', JPEG, IMAGE_TYPES.jpeg);
    assert.equal(await store.remove('+441', id), true);
    assert.equal(await store.get('+441', id), null);
    assert.equal(await store.remove('+441', id), false);
  }));

test('count is zero for an owner who never uploaded', () =>
  withStore(async (store) => {
    assert.equal(await store.count('+449'), 0);
    assert.equal(await store.get('+449', '0'.repeat(32)), null);
  }));

test('sweep removes files older than the retention time and leftover temp files only', () =>
  withStore(async (store, dir) => {
    const old = await store.save('+441', JPEG, IMAGE_TYPES.jpeg);
    const fresh = await store.save('+441', PNG, IMAGE_TYPES.png);
    const folder = path.join(dir, (await readdir(dir))[0]);
    const longAgo = new Date(Date.now() - 3600_000);
    await utimes(path.join(folder, `${old.id}.jpg`), longAgo, longAgo);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path.join(folder, `${'1'.repeat(32)}.tmp`), 'partial');
    await utimes(path.join(folder, `${'1'.repeat(32)}.tmp`), longAgo, longAgo);
    await writeFile(path.join(folder, 'notes.txt'), 'not ours');
    await utimes(path.join(folder, 'notes.txt'), longAgo, longAgo);

    assert.equal(await store.sweep(), 2);
    assert.equal(await store.get('+441', old.id), null);
    assert.ok(await store.get('+441', fresh.id));
    assert.ok((await readdir(folder)).includes('notes.txt'), 'unknown files are left alone');
  }));

test('sweep on a store that has never been written to is a no-op', () =>
  withStore(async (store, dir) => {
    await rm(dir, { recursive: true });
    assert.equal(await store.sweep(), 0);
  }));
