// Exact money. Ledgerly works in Indian rupees (INR) only. An amount is held as a BigInt count
// of 10^-12 of a rupee ("units"), so there is never a floating point sum like 0.1 + 0.2, and a
// person can type any amount: 12.345, 0.001, 2.675, 1e3. Amounts travel as decimal strings
// ("1250.50", "12.345"); nothing here ever turns money into a JavaScript number.
//
// Limits (stated on screen, in the API and in SPEC.md): at most 15 digits before the decimal
// point, at most 12 decimal places, and at most 100 characters of input.

export const MAX_WHOLE_DIGITS = 15;
export const MAX_DECIMALS = 12;
export const MAX_INPUT_LENGTH = 100;
export const LIMITS_TEXT = `Up to ${MAX_WHOLE_DIGITS} digits before the decimal point and ${MAX_DECIMALS} decimal places.`;

const SCALE = 10n ** BigInt(MAX_DECIMALS);
const MAX_EXPONENT = 40;

// Thousands separators people type: 1,250,000 (standard) or 12,50,000 (Indian lakh grouping).
const STANDARD = /^\d{1,3}(?:,\d{3})+(?:\.\d*)?$/;
const INDIAN = /^\d{1,2}(?:,\d{2})+,\d{3}(?:\.\d*)?$/;
const PLAIN = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

const fail = (reason, message) => ({ ok: false, reason, message });

// A pasted rupee mark is fine: ₹ 1,250.50, Rs. 1,250.50, Rs 500/-, INR 1250.
function stripRupees(text) {
  return text
    .replace(/^(?:₹|rs\.?|inr)\s*/i, '')
    .replace(/\s*(?:₹|\/-)$/, '')
    .trim();
}

// Reads a typed amount into exact units, or says why not.
//   parseAmount("1,250.5")                     -> { ok: true, units: 1250500000000000n }
//   parseAmount("12.345")                      -> ok (an amount with any number of decimals)
//   parseAmount("1e3")                         -> ok, 1000
//   parseAmount("-5", { allowNegative: true }) -> ok, -5
//   parseAmount("12.1234567890123")            -> { ok: false, reason: 'too_precise', message }
// A blank is not an error here: callers decide what "missing" means (see calculate.js).
export function parseAmount(input, { allowNegative = false } = {}) {
  if (typeof input !== 'string') {
    return fail('invalid', 'Amounts must be sent as text such as "1250.50", not as numbers.');
  }
  let text = input.trim();
  if (text.length > MAX_INPUT_LENGTH) {
    return fail(
      'too_long',
      `That is too long to be an amount (at most ${MAX_INPUT_LENGTH} characters).`,
    );
  }

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  } else if (/^[-−]/.test(text)) {
    negative = true;
    text = text.slice(1).trim();
  }
  text = stripRupees(text);
  if (negative && !allowNegative) return fail('negative', 'Amounts cannot be negative.');

  if (/[$£€¥]/.test(text)) {
    return fail(
      'invalid',
      'Ledgerly works in rupees (₹). Type the amount without that currency sign.',
    );
  }
  const plain = STANDARD.test(text) || INDIAN.test(text) ? text.replaceAll(',', '') : text;
  if (!PLAIN.test(plain)) {
    return fail(
      'invalid',
      'Enter a number such as 1250.50 (digits, a decimal point and commas only).',
    );
  }

  const [mantissa, exponentText] = plain.toLowerCase().split('e');
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  if (Math.abs(exponent) > MAX_EXPONENT) return fail('too_large', tooLarge());

  const [wholeText, fracText = ''] = mantissa.split('.');
  // Move the decimal point by the exponent, working on the digits so nothing is rounded.
  let digits = (wholeText + fracText).replace(/^0+/, '');
  let decimals = fracText.length - exponent; // places after the point once the exponent is applied
  if (digits === '') decimals = 0; // zero is zero, however it is written
  if (decimals < 0) {
    if (digits !== '') digits += '0'.repeat(-decimals);
    decimals = 0;
  }
  while (decimals > 0 && digits.endsWith('0')) {
    digits = digits.slice(0, -1); // trailing zeros are not precision: 5.0000000000000 is 5
    decimals -= 1;
  }
  if (decimals > MAX_DECIMALS) {
    return fail('too_precise', `Use at most ${MAX_DECIMALS} decimal places.`);
  }
  const wholeDigits = Math.max(digits.length - decimals, 0);
  if (wholeDigits > MAX_WHOLE_DIGITS) return fail('too_large', tooLarge());

  const magnitude = digits === '' ? 0n : BigInt(digits) * 10n ** BigInt(MAX_DECIMALS - decimals);
  return { ok: true, units: negative ? -magnitude : magnitude };
}

function tooLarge() {
  return `That amount is too large. Use at most ${MAX_WHOLE_DIGITS} digits before the decimal point.`;
}

// Exact units -> the shortest decimal string with at least 2 decimals:
//   0n -> "0.00", 1250500000000000n -> "1250.50", 12345000000000n -> "12.345", -1000000000n -> "-0.001"
export function unitsToString(units) {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / SCALE;
  let frac = String(abs % SCALE)
    .padStart(MAX_DECIMALS, '0')
    .replace(/0+$/, '');
  frac = frac.padEnd(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

// Exact units of a plain decimal string such as the ones this module and the calculation
// produce ("-1250.50", "12.345"), with no size limit (a total may be larger than one amount may
// be). Throws on anything else, including more than 12 decimals.
export function toUnits(amount) {
  const m = /^(-?)(\d+)(?:\.(\d*))?$/.exec(String(amount).trim());
  if (!m || (m[3] ?? '').replace(/0+$/, '').length > MAX_DECIMALS) {
    throw new TypeError(`Not a plain amount: ${amount}`);
  }
  const magnitude =
    BigInt(m[2]) * SCALE + BigInt((m[3] ?? '').padEnd(MAX_DECIMALS, '0').slice(0, MAX_DECIMALS));
  return m[1] ? -magnitude : magnitude;
}

// Adds decimal strings exactly: sumAmounts(['0.10', '0.2']) -> "0.30". Sums may exceed the
// one-amount limit.
export function sumAmounts(amounts) {
  return unitsToString(amounts.reduce((total, a) => total + toUnits(a), 0n));
}

// True when an amount string has digits beyond the 2nd decimal place (12.345, not 12.30).
export function hasExtraDecimals(amount) {
  return toUnits(amount) % (SCALE / 100n) !== 0n;
}

// Rounds an exact decimal string to 2 decimals, half away from zero: "2.675" -> "2.68",
// "-2.675" -> "-2.68", "0.004" -> "0.00". Display only: never feed the result back into maths.
export function roundToPaise(amount) {
  const units = toUnits(amount);
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const step = SCALE / 100n;
  const paise = (abs + step / 2n) / step; // half rounds up in size, so -2.675 becomes -2.68
  const text = `${paise / 100n}.${String(paise % 100n).padStart(2, '0')}`;
  return negative && paise !== 0n ? `-${text}` : text;
}
