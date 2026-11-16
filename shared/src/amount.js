// Exact money. An amount is held as a whole number of minor units (pence, cents) in a BigInt,
// so there is never a floating point sum like 0.1 + 0.2. Amounts travel as decimal strings
// ("1250.50"); nothing here ever turns money into a JavaScript number.

// One amount may not exceed 999,999,999,999.99. Totals of many lines may go beyond this.
export const MAX_MINOR = 99_999_999_999_999n;

// Thousands separators people type: 1,250,000 (standard) or 12,50,000 (Indian lakh grouping).
const STANDARD = /^\d{1,3}(?:,\d{3})+(?:\.\d*)?$/;
const INDIAN = /^\d{1,2}(?:,\d{2})+,\d{3}(?:\.\d*)?$/;
const PLAIN = /^\d+(?:\.\d*)?$/;

const fail = (reason, message) => ({ ok: false, reason, message });

// Reads a typed amount.
//   parseAmount("1,250.5")                    -> { ok: true, minor: 125050n }
//   parseAmount("-5", { allowNegative: true }) -> { ok: true, minor: -500n }
//   parseAmount("12.345")                      -> { ok: false, reason: 'too_precise', message }
//   parseAmount("12.345", { round: true })     -> { ok: true, minor: 1235n }   (half rounds away from zero)
// A blank is not an error here: callers decide what "missing" means (see calculate.js).
export function parseAmount(input, { allowNegative = false, round = false } = {}) {
  if (typeof input !== 'string') {
    return fail('invalid', 'Amounts must be sent as text such as "1250.50", not as numbers.');
  }
  let text = input.trim();

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  } else if (/^[-−]/.test(text)) {
    negative = true;
    text = text.slice(1).trim();
  }
  if (negative && !allowNegative) return fail('negative', 'Amounts cannot be negative.');

  const plain = STANDARD.test(text) || INDIAN.test(text) ? text.replaceAll(',', '') : text;
  if (!PLAIN.test(plain)) return fail('invalid', 'Enter a number such as 1250.50.');

  const [whole, frac = ''] = plain.split('.');
  let minor = BigInt(whole) * 100n + BigInt(frac.slice(0, 2).padEnd(2, '0'));
  if (frac.length > 2) {
    if (!round) return fail('too_precise', 'Use at most 2 decimal places.');
    if (frac[2] >= '5') minor += 1n; // half rounds up in size, so -2.675 becomes -2.68
  }
  if (minor > MAX_MINOR) return fail('too_large', 'That amount is too large.');
  return { ok: true, minor: negative ? -minor : minor };
}

// 125050n -> "1250.50", -5n -> "-0.05"
export function minorToString(minor) {
  const abs = minor < 0n ? -minor : minor;
  const text = `${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
  return minor < 0n ? `-${text}` : text;
}
