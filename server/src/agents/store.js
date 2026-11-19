import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// The agents a superadmin has added. A single JSON file, written whole after every change (to a
// temporary file first and then renamed, so a crash never leaves half a file). The invoices an
// agent processes are not kept here: they are the saved invoice history (history/store.js), which
// records the agent's phone number as the owner and as the `agentId`.
//
//   { version: 1, agents: { "+919876543210": { phone, name, addedAt, removedAt } } }
//
// A removed agent stays on file with `removedAt` set, so adding the same number again brings them
// (and the list they had) back. With `file` left out the agents live only in memory.
const VERSION = 1;

export function createAgentStore({ file = null, now = Date.now } = {}) {
  const data = load(file);

  function load(from) {
    if (!from) return { version: VERSION, agents: {} };
    let text;
    try {
      text = readFileSync(from, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return { version: VERSION, agents: {} };
      throw err;
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Never start from a blank slate over a damaged file: that would hide (and then overwrite) it.
      throw new Error(
        `The agents file ${from} is not valid JSON. Fix or move it, then start again.`,
      );
    }
    if (!parsed || parsed.version !== VERSION || typeof parsed.agents !== 'object') {
      throw new Error(`The agents file ${from} is not one this version of Ledgerly can read.`);
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
  };
}
