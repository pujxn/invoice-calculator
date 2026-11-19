import { Router } from 'express';
import { normalizePhone } from '../auth/phone.js';
import { summarize } from './totals.js';

const MAX_NAME = 60;
const PAGE = 50;

// An invoice as the superadmin sees it: the saved history record without the owner's number
// (it is the agent's, already known from the address).
export const publicEntry = (entry) => {
  const { owner: _owner, ...rest } = entry; // eslint-disable-line no-unused-vars
  return rest;
};

// Superadmin only. Adds and removes agents and shows each agent's saved invoices (the history
// records they own) and totals, plus the overall total across every agent (a removed agent's
// saved invoices still count).
//
//   GET    /api/agents                 { agents: [agent], total }
//   POST   /api/agents  { phone, name }     201 { agent, restored: false }   (200 and restored: true for a removed agent added back)
//   GET    /api/agents/:phone          { agent, entries, total, limit, offset }   ?limit= (default 50, at most 200) &offset=
//   DELETE /api/agents/:phone          { agent }            (can no longer sign in; their list stays on file)
//
// where agent = { phone, name, active, addedAt, removedAt, count, debit, credit, net, signedNet, type }
// and the totals cover every invoice the agent saved, not just the page returned.
export function createAgentRouter({ requireSuperadmin, store, roles, history }) {
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

  // Handlers may be async (the history store is), so errors go to the shared error handler.
  const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);

  router.get(
    '/',
    requireSuperadmin,
    route(async (_req, res) => {
      const all = await history.list(null);
      res.json({
        agents: store.listAgents().map((a) =>
          describe(
            a,
            all.filter((e) => e.owner === a.phone),
          ),
        ),
        total: summarize(all),
      });
    }),
  );

  router.post(
    '/',
    requireSuperadmin,
    route(async (req, res) => {
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
        return res
          .status(409)
          .json({ error: `That number is already an agent (${existing.name}).` });
      }
      const { agent, restored } = store.saveAgent({ phone, name });
      res
        .status(restored ? 200 : 201)
        .json({ agent: describe(agent, await history.list(phone)), restored });
    }),
  );

  router.get(
    '/:phone',
    requireSuperadmin,
    route(async (req, res) => {
      const agent = findAgent(req, res);
      if (!agent) return;
      const all = await history.list(agent.phone);
      const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || PAGE));
      const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
      res.json({
        agent: describe(agent, all),
        entries: all.slice(offset, offset + limit).map(publicEntry),
        total: all.length,
        limit,
        offset,
      });
    }),
  );

  router.delete(
    '/:phone',
    requireSuperadmin,
    route(async (req, res) => {
      const agent = findAgent(req, res);
      if (!agent) return;
      const removed = store.removeAgent(agent.phone);
      if (!removed) return res.status(409).json({ error: 'That agent was already removed.' });
      res.json({ agent: describe(removed, await history.list(agent.phone)) });
    }),
  );

  return router;
}

// Agents only: GET /api/my-totals answers the signed-in agent's own totals over every invoice
// they have saved (the history list is paged, so the page cannot add them up).
export function createMyTotalsRouter({ requireAgent, history }) {
  const router = Router();
  router.get('/', requireAgent, (req, res, next) => {
    history
      .list(req.session.phone)
      .then((entries) => res.json(summarize(entries)))
      .catch(next);
  });
  return router;
}
