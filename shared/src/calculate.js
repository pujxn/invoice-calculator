import { parseAmount, roundToPaise, unitsToString, hasExtraDecimals } from './amount.js';

// The calculation. Everything is a list of signed line items:
//   a positive amount is a Debit line, a negative amount is a Credit line,
//   and net = the sum of all the lines.
// An invoice with one Debit and one Credit is simply a list of two lines.
//
//   net > 0  -> Net Debit      net < 0 -> Net Credit (shown as a positive number)      0 -> Balanced

export const MAX_LINES = 5000;

const fail = (reason, message, extra) => ({ ok: false, reason, message, ...extra });

const isMissing = (value) => value === null || value === undefined || String(value).trim() === '';

function build(debitUnits, creditUnits, lineCount) {
  const netUnits = debitUnits - creditUnits; // exact: no rounding happens anywhere in the maths
  const type = netUnits > 0n ? 'debit' : netUnits < 0n ? 'credit' : 'balanced';
  const net = unitsToString(netUnits < 0n ? -netUnits : netUnits); // never negative
  return {
    ok: true,
    type,
    debit: unitsToString(debitUnits), // total of the Debit lines
    credit: unitsToString(creditUnits), // total of the Credit lines, as a positive number
    net, // exact, with every decimal: "10.001"
    netRounded: roundToPaise(net), // the same, rounded to 2 decimals for showing: "10.00"
    rounded: hasExtraDecimals(net), // true when netRounded is not the exact net
    signedNet: unitsToString(netUnits),
    lineCount,
  };
}

// Totals a list of signed line items. Each item is a decimal string ("1250.50" for a Debit,
// "-400.00" for a Credit) or an object with an `amount` string. Blank lines are ignored.
// Any number of decimals (up to 12) is kept exactly. On a bad line the result says which one:
// { ok: false, line, message }.
export function totalLines(items) {
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
    const parsed = parseAmount(String(amount), { allowNegative: true });
    if (!parsed.ok) {
      return fail(parsed.reason, `Line ${index + 1}: ${parsed.message}`, { line: index + 1 });
    }
    if (parsed.units > 0n) debit += parsed.units;
    else credit -= parsed.units;
    count += 1;
  }
  if (count === 0) return fail('nothing', 'Enter at least one amount.');
  return build(debit, credit, count);
}

// The single-invoice case: a Debit and a Credit. Blank or null means the invoice has no such
// amount and counts as 0, but at least one of the two must be given. Both must be 0 or more.
// Returns the same result as totalLines, or { ok: false, field: 'debit' | 'credit', message }.
export function calculateNet({ debit, credit } = {}) {
  const sides = [
    ['debit', debit],
    ['credit', credit],
  ];
  for (const [field, value] of sides) {
    if (isMissing(value)) continue;
    const parsed = parseAmount(String(value), { allowNegative: false });
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
    const { units } = parseAmount(String(value));
    return unitsToString(sign * units);
  };
  const result = totalLines([asLine(debit, 1n), asLine(credit, -1n)]);
  return { ...result, lineCount: [debit, credit].filter((v) => !isMissing(v)).length };
}
