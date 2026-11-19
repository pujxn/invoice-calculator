import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { calculateNet } from '@ledgerly/money';

// Saved invoice history: one record for every invoice that was read and worked out.
//
// This module is the only place that knows how history is kept. Everything else (the routes, and
// later the agent and superadmin screens) goes through this interface, so swapping the file for
// a database means rewriting this one file:
//
//   save(owner, { debit, credit, imageRef?, method?, agentId? })  -> { entry, created }
//   get(owner, id)                                                -> entry | null
//   list(owner)                                                   -> entry[] (newest first)
//   filter(owner, { q, type, from, to, agentId, limit, offset })  -> { entries, total }
//   update(owner, id, { debit, credit })                          -> entry | null
//   remove(owner, id)                                             -> boolean
//
// `owner` is the signed-in phone number. Pass `null` as the owner to look across every owner
// (for a superadmin view); the HTTP routes never do. `agentId` is optional and null for now,
// so roles can attach later without changing the shape of a record.
//
// An entry is: { id, owner, agentId, createdAt, updatedAt, debit, credit, net, netRounded, type,
//                imageRef, method }. Amounts are exact decimal strings in rupees. `net` is never
// negative (see `type`: "debit", "credit" or "balanced"). The totals are always worked out here,
// from the debit and credit, never taken from the caller. `imageRef` is the id of the picture
// that was read. The picture itself is deleted as soon as it is read (spec AI-4), so the
// reference stays as a record of where the amounts came from, not a link that can be opened.

export const METHODS = ['ocr', 'claude', 'mock', 'manual'];
export const TYPES = ['debit', 'credit', 'balanced'];
const ID_PATTERN = /^[0-9a-f]{32}$/;
const AGENT_PATTERN = /^[\w.@+-]{1,64}$/;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export class HistoryError extends Error {
  constructor(message, { status = 400, field } = {}) {
    super(message);
    this.name = 'HistoryError';
    this.status = status;
    if (field) this.field = field;
  }
}

export const isValidId = (id) => typeof id === 'string' && ID_PATTERN.test(id);

// "2026-11-19" is that whole day in UTC; anything else must be a full ISO date and time.
// Returns milliseconds, or NaN when the text is not a date.
export function parseWhen(text, edge) {
  if (typeof text !== 'string') return NaN;
  const value = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const start = Date.parse(`${value}T00:00:00.000Z`);
    if (Number.isNaN(start) || new Date(start).toISOString().slice(0, 10) !== value) return NaN;
    return edge === 'to' ? start + 24 * 60 * 60 * 1000 - 1 : start;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return NaN;
  return Date.parse(value);
}

// Text typed into the search box, reduced to what an amount looks like ("₹1,250" -> "1250").
const squash = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[₹,\s]/g, '');

function matchesQuery(entry, q) {
  const needle = squash(q);
  if (!needle) return true;
  if ([entry.debit, entry.credit, entry.net, entry.netRounded].some((a) => a.includes(needle))) {
    return true;
  }
  const label = entry.type === 'balanced' ? 'balanced' : `net${entry.type}`;
  return label.includes(needle) || entry.method === needle;
}

// `file` is where the history is kept (JSON, written whole after every change, via a temp file
// and a rename so a crash never leaves half a file). Leave it out to keep history in memory only.
export function createHistoryStore({ file = null, now = Date.now, maxPerOwner = 10_000 } = {}) {
  const entries = new Map(); // id -> entry, in the order they were saved
  let writing = Promise.resolve();

  if (file) {
    const target = path.resolve(file);
    try {
      const saved = JSON.parse(readFileSync(target, 'utf8'));
      for (const entry of saved.entries ?? []) entries.set(entry.id, entry);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw new Error(`History file ${target} cannot be read: ${err.message}`, { cause: err });
      }
    }
  }

  // Writes are queued so two changes at once never write the file at the same time.
  function persist() {
    if (!file) return Promise.resolve();
    const target = path.resolve(file);
    const snapshot = JSON.stringify({ version: 1, entries: [...entries.values()] });
    writing = writing
      .catch(() => {})
      .then(async () => {
        await mkdir(path.dirname(target), { recursive: true });
        const temp = `${target}.${randomBytes(4).toString('hex')}.tmp`;
        await writeFile(temp, snapshot, { mode: 0o600 });
        await rename(temp, target);
      });
    return writing;
  }

  const mine = (owner) =>
    [...entries.values()]
      .filter((e) => owner === null || e.owner === owner)
      .sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? 1 : -1));

  // Checks the amounts the same way the calculator does and returns the worked-out figures.
  function work({ debit, credit }) {
    const result = calculateNet({ debit, credit });
    if (!result.ok) throw new HistoryError(result.message, { field: result.field });
    const { type, net, netRounded } = result;
    return { debit: result.debit, credit: result.credit, net, netRounded, type };
  }

  function checkExtras({ imageRef = null, method = 'manual', agentId = null }) {
    if (imageRef !== null && !isValidId(imageRef)) {
      throw new HistoryError('imageRef must be the id of the picture that was read.', {
        field: 'imageRef',
      });
    }
    if (!METHODS.includes(method)) {
      throw new HistoryError(`method must be one of: ${METHODS.join(', ')}.`, { field: 'method' });
    }
    if (agentId !== null && !(typeof agentId === 'string' && AGENT_PATTERN.test(agentId))) {
      throw new HistoryError('agentId is not valid.', { field: 'agentId' });
    }
    return { imageRef, method, agentId };
  }

  return {
    // Saves an invoice. Saving the same picture (imageRef) twice for one owner updates the
    // first record instead of adding a second, so a retry or a double click never duplicates.
    async save(owner, input = {}) {
      const worked = work(input);
      const extras = checkExtras({
        imageRef: input.imageRef ?? null,
        method: input.method ?? 'manual',
        agentId: input.agentId ?? null,
      });
      const iso = new Date(now()).toISOString();
      if (extras.imageRef) {
        const same = [...entries.values()].find(
          (e) => e.owner === owner && e.imageRef === extras.imageRef,
        );
        if (same) {
          const entry = { ...same, ...worked, updatedAt: iso };
          entries.set(entry.id, entry);
          await persist();
          return { entry, created: false };
        }
      }
      if (mine(owner).length >= maxPerOwner) {
        throw new HistoryError(
          `History is full (${maxPerOwner} invoices). Delete some old ones to save more.`,
          { status: 429 },
        );
      }
      const entry = {
        id: randomBytes(16).toString('hex'),
        owner,
        agentId: extras.agentId,
        createdAt: iso,
        updatedAt: iso,
        ...worked,
        imageRef: extras.imageRef,
        method: extras.method,
      };
      entries.set(entry.id, entry);
      await persist();
      return { entry, created: true };
    },

    async get(owner, id) {
      const entry = isValidId(id) ? entries.get(id) : null;
      return entry && (owner === null || entry.owner === owner) ? entry : null;
    },

    async list(owner) {
      return mine(owner);
    },

    // Newest first. Every given criterion must match:
    //   q       text in the debit, credit or net amount (commas and ₹ ignored), or the words
    //           debit / credit / balanced
    //   type    "debit", "credit" or "balanced"
    //   from/to the day or moment a record was saved (inclusive), "2026-11-19" or a full ISO time
    //   agentId records saved for one agent
    // `total` counts every match; `entries` is the page chosen by limit (default 50, at most 200)
    // and offset.
    async filter(owner, criteria = {}) {
      const { q, type, from, to, agentId } = criteria;
      let fromMs = -Infinity;
      let toMs = Infinity;
      if (from !== undefined && from !== null && from !== '') {
        fromMs = parseWhen(from, 'from');
        if (Number.isNaN(fromMs)) {
          throw new HistoryError('"from" must be a date such as 2026-11-19.', { field: 'from' });
        }
      }
      if (to !== undefined && to !== null && to !== '') {
        toMs = parseWhen(to, 'to');
        if (Number.isNaN(toMs)) {
          throw new HistoryError('"to" must be a date such as 2026-11-19.', { field: 'to' });
        }
      }
      if (fromMs > toMs) {
        throw new HistoryError('"from" must not be after "to".', { field: 'from' });
      }
      if (type !== undefined && type !== '' && !TYPES.includes(type)) {
        throw new HistoryError('type must be debit, credit or balanced.', { field: 'type' });
      }
      const limit = Math.min(
        MAX_LIMIT,
        Math.max(1, Number.parseInt(criteria.limit, 10) || DEFAULT_LIMIT),
      );
      const offset = Math.max(0, Number.parseInt(criteria.offset, 10) || 0);

      const matches = mine(owner).filter((e) => {
        const when = Date.parse(e.createdAt);
        return (
          when >= fromMs &&
          when <= toMs &&
          (!type || e.type === type) &&
          (!agentId || e.agentId === agentId) &&
          (!q || matchesQuery(e, q))
        );
      });
      return {
        entries: matches.slice(offset, offset + limit),
        total: matches.length,
        limit,
        offset,
      };
    },

    // Changes the amounts of a saved invoice (the person corrected them); the totals follow.
    async update(owner, id, input = {}) {
      const entry = await this.get(owner, id);
      if (!entry) return null;
      const next = {
        ...entry,
        ...work(input),
        updatedAt: new Date(now()).toISOString(),
      };
      entries.set(id, next);
      await persist();
      return next;
    },

    async remove(owner, id) {
      const entry = await this.get(owner, id);
      if (!entry) return false;
      entries.delete(id);
      await persist();
      return true;
    },
  };
}
