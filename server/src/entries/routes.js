import { Router } from 'express';
import { calculateNet } from '@ledgerly/money';
import { summarize } from '../data/totals.js';

// How the amounts were read: the free local OCR, the AI, demo numbers, or typed by hand.
const METHODS = ['ocr', 'claude', 'mock', 'manual'];

export const publicEntry = ({ id, debit, credit, net, type, method, createdAt }) => ({
  id,
  debit,
  credit,
  net,
  type,
  method,
  createdAt,
});

// Agents only. An agent's own list of processed invoices, kept on the server.
//
//   GET    /api/entries                  { entries, summary }   newest first
//   POST   /api/entries  { debit, credit, method? }   201 { entry, summary }
//   DELETE /api/entries/:id              { entry, summary }     deletes it (and it stops counting)
//
// An entry is one processed invoice: its Debit and Credit and the net worked out from them by the
// same exact-decimal calculation as everywhere else (the server never trusts a net from the
// browser). Entries are not edited: a mistake is deleted and the invoice saved again.
export function createEntryRouter({ requireAgent, store }) {
  const router = Router();
  const owner = (req) => req.session.phone;
  const summary = (req) => summarize(store.listEntries(owner(req)));

  router.get('/', requireAgent, (req, res) => {
    const entries = store.listEntries(owner(req));
    res.json({ entries: entries.map(publicEntry), summary: summarize(entries) });
  });

  router.post('/', requireAgent, (req, res) => {
    const b = req.body;
    if (b === null || typeof b !== 'object' || Array.isArray(b)) {
      return res.status(400).json({ error: 'Send { "debit": "1250.50", "credit": "400.00" }.' });
    }
    const isText = (v) => v === null || v === undefined || typeof v === 'string';
    if (!isText(b.debit) || !isText(b.credit)) {
      return res
        .status(400)
        .json({ error: 'Send amounts as text such as "1250.50", not as numbers.' });
    }
    if (b.method !== undefined && b.method !== null && !METHODS.includes(b.method)) {
      return res.status(400).json({ error: `method must be one of: ${METHODS.join(', ')}.` });
    }
    const result = calculateNet({ debit: b.debit, credit: b.credit });
    if (!result.ok) {
      return res.status(400).json({
        error: result.message,
        ...(result.field ? { field: result.field } : {}),
      });
    }
    const entry = store.saveEntry(owner(req), {
      debit: result.debit,
      credit: result.credit,
      net: result.net,
      type: result.type,
      method: b.method ?? null,
    });
    res.status(201).json({ entry: publicEntry(entry), summary: summary(req) });
  });

  router.delete('/:id', requireAgent, (req, res) => {
    // Another agent's entry looks exactly like one that does not exist.
    const entry = store.removeEntry(owner(req), req.params.id);
    if (!entry) return res.status(404).json({ error: 'No such entry.' });
    res.json({ entry: publicEntry(entry), summary: summary(req) });
  });

  return router;
}
