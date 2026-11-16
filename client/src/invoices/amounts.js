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
