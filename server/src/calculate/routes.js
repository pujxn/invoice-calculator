import { Router } from 'express';
import { calculateNet, totalLines } from '@ledgerly/money';

// POST /api/invoices/calculate
//   { debit, credit }  the usual invoice: decimal strings or null for "none"
//   { items: [...] }   a list of signed line items: "1250.50" is a Debit line, "-400.00" a Credit line
// Answers { debit, credit, net, signedNet, type, lineCount } with every amount as an exact
// decimal string; `net` is never negative and `type` is "debit", "credit" or "balanced".
// Amounts must be strings: a JSON number has already been through floating point.
export function createCalculateRouter({ requireAuth }) {
  const router = Router();

  router.post('/', requireAuth, (req, res) => {
    const body = req.body;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Send { "debit": "1250.50", "credit": "400.00" }.' });
    }
    const isText = (v) => v === null || v === undefined || typeof v === 'string';
    const values = Array.isArray(body.items) ? body.items : [body.debit, body.credit];
    if (!values.every((v) => isText(v) || (v && typeof v === 'object' && isText(v.amount)))) {
      return res
        .status(400)
        .json({ error: 'Send amounts as text such as "1250.50", not as numbers.' });
    }
    if (body.items !== undefined && !Array.isArray(body.items)) {
      return res.status(400).json({ error: '"items" must be a list of amounts.' });
    }

    const result = Array.isArray(body.items)
      ? totalLines(body.items)
      : calculateNet({ debit: body.debit, credit: body.credit });
    if (!result.ok) {
      return res.status(400).json({
        error: result.message,
        ...(result.field ? { field: result.field } : {}),
        ...(result.line ? { line: result.line } : {}),
      });
    }
    const { debit, credit, net, signedNet, type, lineCount } = result;
    res.json({ debit, credit, net, signedNet, type, lineCount });
  });

  return router;
}
