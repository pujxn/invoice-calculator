// Showing money. Ledgerly shows Indian rupees only: the ₹ sign and lakh grouping (12,34,567.50).
// All of it works on the exact decimal strings from the calculation, never on floating point
// numbers, so large totals keep every digit.

import { hasExtraDecimals, roundToPaise } from './amount.js';

export const CURRENCY = 'INR';
export const SYMBOL = '₹';

export const LABELS = { debit: 'Net Debit', credit: 'Net Credit', balanced: 'Balanced' };

// Groups the whole part the Indian way: 1234567 -> "12,34,567" (last three digits, then pairs).
function group(digits) {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const parts = [];
  for (let end = rest.length; end > 0; end -= 2) {
    parts.unshift(rest.slice(Math.max(0, end - 2), end));
  }
  return `${parts.join(',')},${last3}`;
}

// formatAmount("1250.5")                  -> "₹1,250.50"
// formatAmount("12.345")                  -> "₹12.35"   (shown rounded to 2 decimals, half away from zero)
// formatAmount("12.345", { exact: true }) -> "₹12.345"  (every decimal that is there)
// formatAmount("-5")                      -> "-₹5.00"
// Text that is not a plain amount is returned as it came.
export function formatAmount(amount, { exact = false } = {}) {
  const text = String(amount).trim();
  if (!/^-?\d+(?:\.\d*)?$/.test(text)) return String(amount);
  let shown = text;
  if (!exact) {
    try {
      shown = roundToPaise(text);
    } catch {
      return String(amount); // more than 12 decimals: not something the app produced
    }
  }
  const m = /^(-?)(\d+)(?:\.(\d*))?$/.exec(shown);
  const frac = (m[3] ?? '').replace(/0+$/, '').padEnd(2, '0');
  return `${m[1]}${SYMBOL}${group(m[2].replace(/^0+(?=\d)/, ''))}.${frac}`;
}

// Words for a result from calculateNet or totalLines, ready for the screen and for copying.
//   { label: 'Net Debit', amount: '₹850.00', working: 'Debit ₹1,250.00 − Credit ₹400.00 = ₹850.00',
//     text: 'Net Debit ₹850.00 (Debit ₹1,250.00 − Credit ₹400.00)', rounded: false, exact: '₹850.00',
//     note: null }
// When the exact result has more than 2 decimals, `amount` is rounded to 2 for the big figure,
// `rounded` is true, and `note` says so and gives the `exact` figure; the working and the copied
// text show every decimal, so the sum on screen adds up.
export function describeResult(result) {
  const exactMoney = (value) => formatAmount(value, { exact: true });
  const label = LABELS[result.type];
  const rounded = hasExtraDecimals(result.net);
  const amount = formatAmount(result.net);
  const exact = exactMoney(result.net);
  const sum = `Debit ${exactMoney(result.debit)} − Credit ${exactMoney(result.credit)}`;
  const sign = result.type === 'credit' ? '−' : '';
  const base = result.type === 'balanced' ? 'Balanced' : label;
  return {
    label,
    amount,
    exact,
    rounded,
    note: rounded ? `Shown rounded to 2 decimal places. The exact amount is ${exact}.` : null,
    working: `${sum} = ${sign}${exact}`,
    text: `${base} ${amount} (${sum}${rounded ? `, exact amount ${exact}` : ''})`,
  };
}
