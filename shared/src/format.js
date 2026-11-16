// Showing money. All of it works on the exact decimal strings and BigInts from the calculation,
// never on floating point numbers, so large totals keep every digit.

const SYMBOLS = { GBP: '£', USD: '$', EUR: '€', INR: '₹', JPY: '¥', AUD: 'A$', CAD: 'C$' };

export const LABELS = { debit: 'Net Debit', credit: 'Net Credit', balanced: 'Balanced' };

// Groups the whole part with commas: 1234567 -> "1,234,567". Indian rupee amounts use lakh
// grouping (12,34,567) because that is how they are written there.
function group(digits, indian) {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const size = indian ? 2 : 3;
  const parts = [];
  for (let end = rest.length; end > 0; end -= size) {
    parts.unshift(rest.slice(Math.max(0, end - size), end));
  }
  return `${parts.join(',')},${last3}`;
}

// formatAmount("1250.5", "GBP") -> "£1,250.50"; formatAmount("-5", null) -> "-5.00"
// An unknown 3-letter code is shown in front ("CHF 1,250.00"); with no currency, just the number.
export function formatAmount(amount, currency) {
  const m = /^(-?)(\d+)(?:\.(\d*))?$/.exec(String(amount).trim());
  if (!m) return String(amount);
  const code = typeof currency === 'string' ? currency.trim().toUpperCase() : '';
  const number = `${group(m[2].replace(/^0+(?=\d)/, ''), code === 'INR')}.${(m[3] ?? '').padEnd(2, '0')}`;
  const symbol = SYMBOLS[code];
  const prefix = symbol ?? (/^[A-Z]{3}$/.test(code) ? `${code}\u00a0` : '');
  return `${m[1]}${prefix}${number}`;
}

// Words for a result from calculateNet or totalLines, ready for the screen and for copying.
//   { label: 'Net Debit', amount: '£850.00', working: 'Debit £1,250.00 − Credit £400.00 = £850.00',
//     text: 'Net Debit £850.00 (Debit £1,250.00 − Credit £400.00)' }
export function describeResult(result, currency) {
  const money = (value) => formatAmount(value, currency);
  const label = LABELS[result.type];
  const amount = money(result.net);
  const sum = `Debit ${money(result.debit)} − Credit ${money(result.credit)}`;
  return {
    label,
    amount,
    working: `${sum} = ${result.type === 'credit' ? '−' : ''}${amount}`,
    text:
      result.type === 'balanced' ? `Balanced ${amount} (${sum})` : `${label} ${amount} (${sum})`,
  };
}
