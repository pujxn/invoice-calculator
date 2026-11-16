// Exact money handling. Amounts travel as decimal strings ("1234.50") and are added as whole
// minor units (cents) in BigInt, so there is never a floating point sum like 0.1 + 0.2.
const MAX_CENTS = 99_999_999_999_999n; // 999,999,999,999.99

// Standard grouping (1,234,567) and Indian lakh grouping (12,34,567).
const GROUPED = /^\d{1,3}(?:SEP\d{3})+$/;
const GROUPED_INDIAN = /^\d{1,2}(?:SEP\d{2})*SEP\d{3}$/;
const grouped = (digits, sep) =>
  new RegExp(GROUPED.source.replaceAll('SEP', `\\${sep}`)).test(digits) ||
  new RegExp(GROUPED_INDIAN.source.replaceAll('SEP', `\\${sep}`)).test(digits);

const fail = (reason, message) => ({ ok: false, reason, message });
const done = (cents) =>
  cents > MAX_CENTS
    ? fail('too_large', 'That amount is too large to be an invoice amount.')
    : { ok: true, value: centsToString(cents) };

export function centsToString(cents) {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const frac = String(abs % 100n).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

// "1234.50" -> 123450n. Only for strings this module produced (or any plain decimal).
export function toCents(amount) {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(amount));
  if (!m) throw new TypeError(`Not a plain amount: ${amount}`);
  return BigInt(m[1]) * 100n + BigInt((m[2] || '').padEnd(2, '0') || '0');
}

export function sumAmounts(amounts) {
  return centsToString(amounts.reduce((total, a) => total + toCents(a), 0n));
}

// Turns whatever the model printed ("£1,234.50", "1.234,50", "1 234,5", null) into
//   { ok: true, value: "1234.50" | null }   or   { ok: false, reason, message }.
// Anything that could be read two ways ("1,234" is 1234 or 1.234) is refused, never guessed.
export function parseAmount(input) {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return fail('invalid', 'That is not a number.');
    // Numbers only come from tests and mocks; String() keeps 12.5 as "12.5" (never 12.499999).
    return parseAmount(String(input));
  }
  if (typeof input !== 'string') return fail('invalid', 'That is not an amount.');

  let text = input.trim();
  if (text === '') return { ok: true, value: null };

  const negative = /^[-−(]/.test(text) || /-\s*$/.test(text) || /^\(.*\)$/.test(text);
  if (negative)
    return fail(
      'negative',
      `"${input.trim()}" is negative. Amounts must be 0 or more, so please check it.`,
    );

  // Drop currency symbols and codes and any spaces, apostrophes or thin spaces used as grouping.
  text = text
    .replace(/[A-Za-z]{3}/g, '')
    .replace(/[£$€¥₹¢₩₽฿₪₫]/g, '')
    .replace(/[\s\u00a0\u202f\u2009'\u2019]/g, '');
  if (!/^[0-9.,]+$/.test(text) || !/\d/.test(text)) {
    return fail('invalid', `"${input.trim()}" is not an amount.`);
  }

  const dots = (text.match(/\./g) || []).length;
  const commas = (text.match(/,/g) || []).length;
  let whole;
  let frac = '';

  if (dots && commas) {
    // The separator that comes last is the decimal point; the other must group thousands.
    const decimal = text.lastIndexOf('.') > text.lastIndexOf(',') ? '.' : ',';
    const group = decimal === '.' ? ',' : '.';
    const [head, ...rest] = text.split(decimal);
    if (rest.length !== 1 || !grouped(head, group)) {
      return fail('invalid', `"${input.trim()}" is not an amount.`);
    }
    whole = head.split(group).join('');
    frac = rest[0];
  } else if (dots || commas) {
    const sep = dots ? '.' : ',';
    const count = dots || commas;
    const parts = text.split(sep);
    if (count > 1) {
      // 1,234,567 is thousands grouping; anything else with repeated separators is garbage.
      if (!grouped(text, sep)) return fail('invalid', `"${input.trim()}" is not an amount.`);
      whole = parts.join('');
    } else {
      const [head, tail] = parts;
      if (tail.length === 0 || head.length === 0) {
        return fail('invalid', `"${input.trim()}" is not an amount.`);
      }
      if (tail.length <= 2) {
        whole = head;
        frac = tail;
      } else if (tail.length === 3 && Number(head) !== 0 && head.length <= 3) {
        const asThousands = `${head}${tail}`;
        const asDecimal = `${head}.${tail}`;
        return fail(
          'ambiguous',
          `"${input.trim()}" could mean ${Number(asThousands).toLocaleString('en')} or ${asDecimal}.`,
        );
      } else {
        return fail('too_precise', `"${input.trim()}" has more than 2 decimal places.`);
      }
    }
  } else {
    whole = text;
  }

  whole = whole.replace(/^0+(?=\d)/, '');
  if (whole.length > 12)
    return fail('too_large', 'That amount is too large to be an invoice amount.');
  return done(BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0') || '0'));
}
