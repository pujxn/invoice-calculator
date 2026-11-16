import { parseAmount, minorToString } from '@ledgerly/money';

// Checks an amount typed into the Debit or Credit box. Amounts stay as text (never floats) and
// follow CALC-1: 0 or more, up to 2 decimals. A blank box is allowed: it means "none".
// Returns { ok: true, value } (value is a clean "1250.50", or "" for blank) or { ok: false, message }.
export function checkAmount(text) {
  const raw = String(text ?? '').trim();
  if (raw === '') return { ok: true, value: '' };
  const parsed = parseAmount(raw);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  return { ok: true, value: minorToString(parsed.minor) };
}
