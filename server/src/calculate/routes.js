import { Router } from 'express';
import { calculateNet } from '@ledgerly/money';

// POST /api/invoices/calculate
//   { debit, credit }  decimal strings, or null for "none"
// Answers { debit, credit, net, netRounded, rounded, signedNet, type } with every
// amount as an exact decimal string; `net` is never negative, keeps every decimal ("10.001"),
// and `type` is "debit", "credit" or "balanced". `netRounded` is the same figure rounded to 2
// decimals for showing, and `rounded` says whether that changed it. Amounts are in rupees; any
// number of decimals up to 12 and up to 15 digits before the point are accepted (see
// @ledgerly/money). Amounts must be strings: a JSON number has already been through floating point.
export function createCalculateRouter({ requireAuth }) {
  const router = Router();

  router.post('/', requireAuth, (req, res) => {
    const body = req.body;
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Send { "debit": "1250.50", "credit": "400.00" }.' });
    }
    const isText = (v) => v === null || v === undefined || typeof v === 'string';
    if (!isText(body.debit) || !isText(body.credit)) {
      return res
        .status(400)
        .json({ error: 'Send amounts as text such as "1250.50", not as numbers.' });
    }

    const result = calculateNet({ debit: body.debit, credit: body.credit });
    if (!result.ok) {
      return res.status(400).json({
        error: result.message,
        ...(result.field ? { field: result.field } : {}),
      });
    }
    const { debit, credit, net, netRounded, rounded, signedNet, type } = result;
    res.json({ debit, credit, net, netRounded, rounded, signedNet, type });
  });

  return router;
}
