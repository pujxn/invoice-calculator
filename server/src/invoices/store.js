import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { mimeForExt } from './fileType.js';

// Where uploaded invoice pictures live: <dir>/<hash of owner>/<id>.<ext>.
// The owner is part of the path, so one user can never reach another user's file, and
// the file name is a random id plus an extension we chose, never anything the client sent.
// Nothing is kept in memory, so uploads survive a server restart (sessions do not).
const ID_PATTERN = /^[0-9a-f]{32}$/;
const FILE_PATTERN = /^([0-9a-f]{32})\.(jpg|png|webp|heic)$/;

export const isValidId = (id) => typeof id === 'string' && ID_PATTERN.test(id);

export function createUploadStore({ dir, ttlMs, maxPerUser, now = Date.now }) {
  const root = path.resolve(dir);
  const ownerDir = (owner) =>
    path.join(root, createHash('sha256').update(String(owner)).digest('hex').slice(0, 32));

  async function list(owner) {
    let names;
    try {
      names = await readdir(ownerDir(owner));
    } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    return names.filter((n) => FILE_PATTERN.test(n));
  }

  async function describe(owner, name) {
    const [, id, ext] = FILE_PATTERN.exec(name);
    const file = path.join(ownerDir(owner), name);
    const info = await stat(file);
    return {
      id,
      mimeType: mimeForExt(ext),
      size: info.size,
      createdAt: new Date(info.mtimeMs).toISOString(),
      file,
    };
  }

  return {
    root,
    maxPerUser,

    async count(owner) {
      return (await list(owner)).length;
    },

    // Writes via a temp file and rename so a half-written picture is never served.
    async save(owner, buffer, type) {
      const folder = ownerDir(owner);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const id = randomBytes(16).toString('hex');
      const final = path.join(folder, `${id}.${type.ext}`);
      const temp = path.join(folder, `${id}.tmp`);
      await writeFile(temp, buffer, { flag: 'wx', mode: 0o600 });
      await rename(temp, final);
      const { id: savedId, mimeType, size, createdAt } = await describe(owner, `${id}.${type.ext}`);
      return { id: savedId, mimeType, size, createdAt };
    },

    // Returns { id, mimeType, size, createdAt, file } or null (unknown id or not the owner's).
    async get(owner, id) {
      if (!isValidId(id)) return null;
      const name = (await list(owner)).find((n) => n.startsWith(`${id}.`));
      return name ? describe(owner, name) : null;
    },

    async read(owner, id) {
      const found = await this.get(owner, id);
      return found ? { ...found, data: await readFile(found.file) } : null;
    },

    async remove(owner, id) {
      const found = await this.get(owner, id);
      if (!found) return false;
      await rm(found.file, { force: true });
      return true;
    },

    // Deletes pictures older than the retention time and leftover temp files. Returns how many.
    async sweep() {
      let removed = 0;
      let owners;
      try {
        owners = await readdir(root, { withFileTypes: true });
      } catch (err) {
        if (err.code === 'ENOENT') return 0;
        throw err;
      }
      for (const entry of owners.filter((e) => e.isDirectory())) {
        const folder = path.join(root, entry.name);
        for (const name of await readdir(folder)) {
          if (!FILE_PATTERN.test(name) && !name.endsWith('.tmp')) continue;
          const file = path.join(folder, name);
          const info = await stat(file).catch(() => null);
          if (info && now() - info.mtimeMs > ttlMs) {
            await rm(file, { force: true });
            removed += 1;
          }
        }
      }
      return removed;
    },
  };
}
