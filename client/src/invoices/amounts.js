import { LIMITS_TEXT, parseAmount, unitsToString } from '@ledgerly/money';

// What is said under the boxes: any amount is welcome, within these limits.
export const AMOUNT_HINT = `Type any amount in rupees (₹), for example 1,250.50 or 12.345. ${LIMITS_TEXT}`;

// Checks an amount typed into the Debit or Credit box. Amounts stay as text (never floats) and
// follow CALC-1: 0 or more, any number of decimals up to the limit. A blank box is allowed: it
// means "none". Returns { ok: true, value } (value is a clean "1250.50" or "12.345", or "" for
// blank) or { ok: false, message }.
export function checkAmount(text) {
  const raw = String(text ?? '').trim();
  if (raw === '') return { ok: true, value: '' };
  const parsed = parseAmount(raw);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  return { ok: true, value: unitsToString(parsed.units) };
}

// How sure the reader was of one amount: 'high', 'low', or null (nothing to flag: typed by hand,
// an empty box, or changed by the person, who has then checked it themselves). Older results
// without per-amount levels fall back to the level for the whole picture.
export function amountFlag(result, field, value) {
  if (!result || result.provider === 'manual') return null;
  const read = result[field];
  if (read === null || read === undefined || value !== read) return null;
  const given = result.amountConfidence?.[field];
  if (given === 'high' || given === 'low') return given;
  if (result.amountConfidence) return null;
  return result.confidence === 'high' ? 'high' : 'low';
}

export const FLAG_TEXT = {
  high: { badge: 'High confidence', hint: 'Every reading agreed on this amount.' },
  low: {
    badge: 'Low confidence',
    hint: 'Please double-check this amount against your picture.',
  },
};
