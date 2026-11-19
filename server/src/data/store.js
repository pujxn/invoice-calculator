import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

// The one place Ledgerly keeps data that must survive a restart: the agents a superadmin has added
// and the invoices each agent has saved. A single JSON file, written whole after every change
// (to a temporary file first and then renamed, so a crash never leaves half a file).
//
// It is deliberately small and plain so that saved history, a database or export can be built on
// it later: each saved invoice is one flat entry that is never edited, only deleted.
//
//   { version: 1,
//     agents:  { "+919876543210": { phone, name, addedAt, removedAt } },
//     entries: [ { id, owner, agentId, debit, credit, net, type, method, createdAt } ] }
//
// Amounts are exact decimal strings in rupees, exactly as the calculation produced them.
// With `file` left out the data lives only in memory (the automated tests use that or a temp file).
const VERSION = 1;

export function createDataStore({ file = null, now = Date.now } = {}) {
  let data = load(file);

  function load(from) {
    if (!from) return { version: VERSION, agents: {}, entries: [] };
    let text;
    try {
      text = readFileSync(from, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return { version: VERSION, agents: {}, entries: [] };
      throw err;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Never start from a blank slate over a damaged file: that would hide (and then overwrite) it.
      throw new Error(`The data file ${from} is not valid JSON. Fix or move it, then start again.`);
    }
    if (
      !parsed ||
      parsed.version !== VERSION ||
      typeof parsed.agents !== 'object' ||
      !Array.isArray(parsed.entries)
    ) {
      throw new Error(`The data file ${from} is not a Ledgerly data file this version can read.`);
    }
    return parsed;
  }

  function persist() {
    if (!file) return;
    mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
    renameSync(temp, file);
  }

  const iso = () => new Date(now()).toISOString();
  const copy = (value) => (value ? structuredClone(value) : null);

  return {
    file,

    getAgent: (phone) => copy(data.agents[phone]),
    // Oldest first, removed agents included (their saved invoices still count).
    listAgents: () =>
      Object.values(data.agents)
        .map(copy)
        .sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.phone.localeCompare(b.phone)),

    // Adds an agent, or brings a removed one back (keeping the invoices they saved before).
    // The caller has already checked the number is not an active agent or a superadmin.
    saveAgent({ phone, name }) {
      const existing = data.agents[phone];
      data.agents[phone] = existing
        ? { ...existing, name, removedAt: null }
        : { phone, name, addedAt: iso(), removedAt: null };
      persist();
      return { agent: copy(data.agents[phone]), restored: Boolean(existing) };
    },
    removeAgent(phone) {
      const agent = data.agents[phone];
      if (!agent || agent.removedAt) return null;
      agent.removedAt = iso();
      persist();
      return copy(agent);
    },

    // Saved invoices, in the shape of the saved-invoice history records (owner, method), so the
    // history store can replace this part: save(owner, record), list(owner), get(owner, id), remove(owner, id).
    // `owner` is the agent's phone number; list() with no owner returns everyone's, newest first.
    saveEntry(owner, { debit, credit, net, type, method }) {
      const entry = {
        id: `ent_${randomBytes(9).toString('base64url')}`,
        owner,
        agentId: owner,
        debit,
        credit,
        net,
        type,
        method: method ?? null,
        createdAt: iso(),
      };
      data.entries.push(entry);
      persist();
      return copy(entry);
    },
    getEntry: (owner, id) => copy(data.entries.find((e) => e.id === id && e.owner === owner)),
    listEntries: (owner = null) =>
      data.entries
        .filter((e) => owner === null || e.owner === owner)
        .map(copy)
        .reverse(),
    // Deletes one of an owner's entries. Returns it, or null if there is no such entry.
    removeEntry(owner, id) {
      const at = data.entries.findIndex((e) => e.id === id && e.owner === owner);
      if (at < 0) return null;
      const [entry] = data.entries.splice(at, 1);
      persist();
      return entry;
    },
  };
}
