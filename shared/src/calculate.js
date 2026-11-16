import { minorToString, parseAmount } from './amount.js';

// The calculation. Everything is a list of signed line items:
//   a positive amount is a Debit line, a negative amount is a Credit line,
//   and net = the sum of all the lines.
// An invoice with one Debit and one Credit is simply a list of two lines.
//
//   net > 0  -> Net Debit      net < 0 -> Net Credit (shown as a positive number)      0 -> Balanced

export const MAX_LINES = 5000;

const fail = (reason, message, extra) => ({ ok: false, reason, message, ...extra });

const isMissing = (value) => value === null || value === undefined || String(value).trim() === '';

function build(debitMinor, creditMinor, lineCount) {
  const netMinor = debitMinor - creditMinor; // exact, in minor units
  const type = netMinor > 0n ? 'debit' : netMinor < 0n ? 'credit' : 'balanced';
  return {
    ok: true,
    type,
    debit: minorToString(debitMinor), // total of the Debit lines
    credit: minorToString(creditMinor), // total of the Credit lines, as a positive number
    net: minorToString(netMinor < 0n ? -netMinor : netMinor), // never negative
    signedNet: minorToString(netMinor),
    lineCount,
    debitMinor,
    creditMinor,
    netMinor,
  };
}

// Totals a list of signed line items. Each item is a decimal string ("1250.50" for a Debit,
// "-400.00" for a Credit) or an object with an `amount` string. Blank lines are ignored.
// Options: `round: true` rounds lines with more than 2 decimals (half away from zero) instead
// of refusing them. On a bad line the result says which one: { ok: false, line, message }.
export function totalLines(items, options = {}) {
  if (!Array.isArray(items)) return fail('invalid', 'Send a list of lines.');
  if (items.length > MAX_LINES) {
    return fail('too_many', `A list can have at most ${MAX_LINES} lines.`);
  }
  let debit = 0n;
  let credit = 0n;
  let count = 0;
  for (const [index, item] of items.entries()) {
    const amount = item !== null && typeof item === 'object' ? item.amount : item;
    if (isMissing(amount)) continue;
    const parsed = parseAmount(String(amount), { ...options, allowNegative: true });
    if (!parsed.ok) {
      return fail(parsed.reason, `Line ${index + 1}: ${parsed.message}`, { line: index + 1 });
    }
    if (parsed.minor > 0n) debit += parsed.minor;
    else credit -= parsed.minor;
    count += 1;
  }
  if (count === 0) return fail('nothing', 'Enter at least one amount.');
  return build(debit, credit, count);
}

// The single-invoice case: a Debit and a Credit. Blank or null means the invoice has no such
// amount and counts as 0, but at least one of the two must be given. Both must be 0 or more.
// Returns the same result as totalLines, or { ok: false, field: 'debit' | 'credit', message }.
export function calculateNet({ debit, credit } = {}, options = {}) {
  const sides = [
    ['debit', debit],
    ['credit', credit],
  ];
  for (const [field, value] of sides) {
    if (isMissing(value)) continue;
    const parsed = parseAmount(String(value), { ...options, allowNegative: false });
    if (!parsed.ok) {
      const label = field === 'debit' ? 'Debit' : 'Credit';
      return fail(parsed.reason, `${label}: ${parsed.message}`, { field });
    }
  }
  if (isMissing(debit) && isMissing(credit)) {
    return fail('nothing', 'Enter at least one amount (a Debit, a Credit, or both).');
  }
  const asLine = (value, sign) => {
    if (isMissing(value)) return '0';
    const { minor } = parseAmount(String(value), options);
    return minorToString(sign * minor);
  };
  const result = totalLines([asLine(debit, 1n), asLine(credit, -1n)], options);
  return { ...result, lineCount: [debit, credit].filter((v) => !isMissing(v)).length };
}
