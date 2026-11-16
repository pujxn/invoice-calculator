// Reads the amounts the AI printed, as exact decimal strings ("1234.50", "12.345"). Ledgerly
// works in Indian rupees only, so any currency mark is ignored, and every decimal the invoice
// shows is kept: nothing is ever rounded. The exact arithmetic lives in the shared money module.
import {
  parseAmount as parseTyped,
  sumAmounts as sumExact,
  toUnits,
  unitsToString,
} from '@ledgerly/money';

// Standard grouping (1,234,567) and Indian lakh grouping (12,34,567).
const GROUPED = /^\d{1,3}(?:SEP\d{3})+$/;
const GROUPED_INDIAN = /^\d{1,2}(?:SEP\d{2})*SEP\d{3}$/;
const grouped = (digits, sep) =>
  new RegExp(GROUPED.source.replaceAll('SEP', `\\${sep}`)).test(digits) ||
  new RegExp(GROUPED_INDIAN.source.replaceAll('SEP', `\\${sep}`)).test(digits);

const fail = (reason, message) => ({ ok: false, reason, message });
// A plain "1234.5" -> the exact string, or the shared module's reason (too large, too precise).
const done = (plain) => {
  const parsed = parseTyped(plain);
  if (!parsed.ok) return fail(parsed.reason, parsed.message);
  return { ok: true, value: unitsToString(parsed.units) };
};

export const sumAmounts = sumExact;
// True when two decimal strings are the same amount ("10.50" and "10.5").
export const sameAmount = (a, b) => toUnits(a) === toUnits(b);

// Turns whatever the model printed ("₹1,234.50", "Rs. 12,34,567/-", "1.234,50", "0.001", null) into
//   { ok: true, value: "1234.50" | null }   or   { ok: false, reason, message }.
// Any number of decimals is fine when the number is plainly a decimal ("1234.567", "0.001").
// Only a value that could be read two ways ("1,234" is 1234 or 1.234, "12.345" is 12345 or 12.345)
// is refused with both readings, never guessed.
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

  text = text.replace(/\s*\/-\s*$/, ''); // Rs 500/- is 500, not a trailing minus
  const negative = /^[-−(]/.test(text) || /-\s*$/.test(text) || /^\(.*\)$/.test(text);
  if (negative)
    return fail(
      'negative',
      `"${input.trim()}" is negative. Amounts must be 0 or more, so please check it.`,
    );

  // Drop currency symbols and codes and any spaces, apostrophes or thin spaces used as grouping.
  text = text
    .replace(/[A-Za-z]{3}/g, '')
    .replace(/\bRs\.?/gi, '')
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
        // 1234.567, 0.001, 12.3456: too long to be a thousands group, so plainly a decimal.
        whole = head;
        frac = tail;
      }
    }
  } else {
    whole = text;
  }

  return done(frac === '' ? whole : `${whole}.${frac}`);
}
