import { Router } from 'express';
import { HistoryError, isValidId } from './store.js';

// Saved invoice history. Every route needs a signed-in user and only ever touches that user's own
// records: another user's id behaves exactly like an id that does not exist.
//
//   POST   /api/history        { debit, credit, imageRef?, method? }  save (201), or update the
//                              record already saved for the same picture (200)
//   GET    /api/history        ?q=&type=&from=&to=&limit=&offset=     { entries, total, limit, offset }
//   GET    /api/history/:id    one entry, or 404
//   PATCH  /api/history/:id    { debit, credit }                      the corrected entry, or 404
//   DELETE /api/history/:id    { ok: true }, or 404
//
// The totals (net, type) are always worked out on the server from the amounts. Amounts are
// decimal strings, as in the calculate API.
export function createHistoryRouter({ store, requireAuth }) {
  const router = Router();
  const owner = (req) => req.session.phone;

  // The owner is never sent back; the agent id is, so a later agent screen can show it.
  const publicEntry = (entry) => {
    const { owner: _owner, ...rest } = entry; // eslint-disable-line no-unused-vars
    return rest;
  };

  const isText = (v) => v === undefined || v === null || typeof v === 'string';
  const amountsOk = (body) =>
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    isText(body.debit) &&
    isText(body.credit);
  const BAD_AMOUNTS = 'Send amounts as text such as "1250.50", not as numbers.';

  // A bad request from the store (HistoryError) becomes a 400 or 429; anything else is a bug.
  const guard = (handler) => async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (!(err instanceof HistoryError)) return next(err);
      res
        .status(err.status)
        .json({ error: err.message, ...(err.field ? { field: err.field } : {}) });
    }
  };

  router.post(
    '/',
    requireAuth,
    guard(async (req, res) => {
      const body = req.body;
      if (!amountsOk(body)) return res.status(400).json({ error: BAD_AMOUNTS });
      if (!isText(body.imageRef) || !isText(body.method)) {
        return res.status(400).json({ error: 'imageRef and method must be text.' });
      }
      // agentId is deliberately not read from the request: nobody can attach a record to an
      // agent by asking. Only agents reach this route, so it is the signed-in agent's own number.
      const { entry, created } = await store.save(owner(req), {
        agentId: owner(req),
        debit: body.debit,
        credit: body.credit,
        imageRef: body.imageRef ?? null,
        method: body.method ?? undefined,
      });
      res.status(created ? 201 : 200).json(publicEntry(entry));
    }),
  );

  router.get(
    '/',
    requireAuth,
    guard(async (req, res) => {
      const text = (v) => (typeof v === 'string' ? v : undefined);
      const { entries, total, limit, offset } = await store.filter(owner(req), {
        q: text(req.query.q),
        type: text(req.query.type),
        from: text(req.query.from),
        to: text(req.query.to),
        limit: text(req.query.limit),
        offset: text(req.query.offset),
      });
      res.json({ entries: entries.map(publicEntry), total, limit, offset });
    }),
  );

  async function find(req, res, next) {
    try {
      const entry = isValidId(req.params.id) && (await store.get(owner(req), req.params.id));
      if (!entry) return res.status(404).json({ error: 'Saved invoice not found.' });
      req.entry = entry;
      next();
    } catch (err) {
      next(err);
    }
  }

  router.get('/:id', requireAuth, find, (req, res) => res.json(publicEntry(req.entry)));

  router.patch(
    '/:id',
    requireAuth,
    find,
    guard(async (req, res) => {
      if (!amountsOk(req.body)) return res.status(400).json({ error: BAD_AMOUNTS });
      const entry = await store.update(owner(req), req.entry.id, {
        debit: req.body.debit,
        credit: req.body.credit,
      });
      res.json(publicEntry(entry));
    }),
  );

  router.delete(
    '/:id',
    requireAuth,
    find,
    guard(async (req, res) => {
      await store.remove(owner(req), req.entry.id);
      res.json({ ok: true });
    }),
  );

  return router;
}
