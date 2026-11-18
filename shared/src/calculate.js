import { parseAmount, roundToPaise, unitsToString, hasExtraDecimals } from './amount.js';

// The calculation: one Debit amount and one Credit amount, nothing else.
//
//   net = Debit - Credit
//   net > 0  -> Net Debit      net < 0 -> Net Credit (shown as a positive number)      0 -> Balanced

const fail = (reason, message, extra) => ({ ok: false, reason, message, ...extra });

const isMissing = (value) => value === null || value === undefined || String(value).trim() === '';

// A Debit and a Credit. Blank or null means the invoice has no such amount and counts as 0, but
// at least one of the two must be given. Both must be 0 or more. Any number of decimals (up to
// 12) is kept exactly; nothing is rounded in the maths.
// Returns { ok: true, type, debit, credit, net, netRounded, rounded, signedNet } or
// { ok: false, reason, field: 'debit' | 'credit', message }.
export function calculateNet({ debit, credit } = {}) {
  const units = {};
  for (const field of ['debit', 'credit']) {
    const value = field === 'debit' ? debit : credit;
    if (isMissing(value)) {
      units[field] = 0n;
      continue;
    }
    const parsed = parseAmount(String(value), { allowNegative: false });
    if (!parsed.ok) {
      const label = field === 'debit' ? 'Debit' : 'Credit';
      return fail(parsed.reason, `${label}: ${parsed.message}`, { field });
    }
    units[field] = parsed.units;
  }
  if (isMissing(debit) && isMissing(credit)) {
    return fail('nothing', 'Enter at least one amount (a Debit, a Credit, or both).');
  }

  const netUnits = units.debit - units.credit; // exact: no rounding happens anywhere in the maths
  const type = netUnits > 0n ? 'debit' : netUnits < 0n ? 'credit' : 'balanced';
  const net = unitsToString(netUnits < 0n ? -netUnits : netUnits); // never negative
  return {
    ok: true,
    type,
    debit: unitsToString(units.debit),
    credit: unitsToString(units.credit),
    net, // exact, with every decimal: "10.001"
    netRounded: roundToPaise(net), // the same, rounded to 2 decimals for showing: "10.00"
    rounded: hasExtraDecimals(net), // true when netRounded is not the exact net
    signedNet: unitsToString(netUnits),
  };
}
