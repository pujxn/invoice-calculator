import { Router } from 'express';
import { normalizePhone } from '../auth/phone.js';
import { summarize } from '../data/totals.js';
import { publicEntry } from '../entries/routes.js';

const MAX_NAME = 60;

// Superadmin only. Adds and removes agents and shows each agent's saved invoices and totals,
// plus the overall total across every agent (removed agents' saved invoices still count).
//
//   GET    /api/agents                 { agents: [agent], total }
//   POST   /api/agents  { phone, name }     201 { agent }   (200 and restored: true for a removed agent added back)
//   GET    /api/agents/:phone          { agent, entries }
//   DELETE /api/agents/:phone          { agent }            (can no longer sign in; their list stays on file)
//
// where agent = { phone, name, active, addedAt, removedAt, count, debit, credit, net, signedNet, type }
export function createAgentRouter({ requireSuperadmin, store, roles }) {
  const router = Router();

  const describe = (agent, entries) => ({
    phone: agent.phone,
    name: agent.name,
    active: !agent.removedAt,
    addedAt: agent.addedAt,
    removedAt: agent.removedAt,
    ...summarize(entries),
  });

  // The agent named in the address, or null (and the 404 already sent).
  function findAgent(req, res) {
    const phone = normalizePhone(req.params.phone);
    const agent = phone && store.getAgent(phone);
    if (!agent) {
      res.status(404).json({ error: 'No such agent.' });
      return null;
    }
    return agent;
  }

  router.get('/', requireSuperadmin, (_req, res) => {
    const all = store.listEntries();
    res.json({
      agents: store.listAgents().map((a) =>
        describe(
          a,
          all.filter((e) => e.owner === a.phone),
        ),
      ),
      total: summarize(all),
    });
  });

  router.post('/', requireSuperadmin, (req, res) => {
    const body = req.body;
    const phone = normalizePhone(body?.phone);
    if (!phone) {
      return res.status(400).json({
        error: 'Enter the agent’s mobile number in international format, e.g. +919876543210.',
      });
    }
    // Collapse runs of spaces and drop control characters; the name is only ever shown as text.
    const name =
      typeof body?.name === 'string'
        ? body.name
            .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        : '';
    if (!name) return res.status(400).json({ error: 'Enter the agent’s name.' });
    if (name.length > MAX_NAME) {
      return res.status(400).json({ error: `The name can be at most ${MAX_NAME} characters.` });
    }
    if (roles.isSuperadmin(phone)) {
      return res.status(409).json({ error: 'That number belongs to a superadmin.' });
    }
    const existing = store.getAgent(phone);
    if (existing && !existing.removedAt) {
      return res.status(409).json({ error: `That number is already an agent (${existing.name}).` });
    }
    const { agent, restored } = store.saveAgent({ phone, name });
    res
      .status(restored ? 200 : 201)
      .json({ agent: describe(agent, store.listEntries(phone)), restored });
  });

  router.get('/:phone', requireSuperadmin, (req, res) => {
    const agent = findAgent(req, res);
    if (!agent) return;
    const entries = store.listEntries(agent.phone);
    res.json({ agent: describe(agent, entries), entries: entries.map(publicEntry) });
  });

  router.delete('/:phone', requireSuperadmin, (req, res) => {
    const agent = findAgent(req, res);
    if (!agent) return;
    const removed = store.removeAgent(agent.phone);
    if (!removed) return res.status(409).json({ error: 'That agent was already removed.' });
    res.json({ agent: describe(removed, store.listEntries(agent.phone)) });
  });

  return router;
}
