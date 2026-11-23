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

  return netResult(units.debit, units.credit);
}

// Debit minus Credit, from exact units, in the shape every caller gets back.
function netResult(debitUnits, creditUnits) {
  const netUnits = debitUnits - creditUnits; // exact: no rounding happens anywhere in the maths
  const type = netUnits > 0n ? 'debit' : netUnits < 0n ? 'credit' : 'balanced';
  const net = unitsToString(netUnits < 0n ? -netUnits : netUnits); // never negative
  return {
    ok: true,
    type,
    debit: unitsToString(debitUnits),
    credit: unitsToString(creditUnits),
    net, // exact, with every decimal: "10.001"
    netRounded: roundToPaise(net), // the same, rounded to 2 decimals for showing: "10.00"
    rounded: hasExtraDecimals(net), // true when netRounded is not the exact net
    signedNet: unitsToString(netUnits),
  };
}

// Many invoices, one combined total: every invoice's Debit added up, every invoice's Credit added
// up, then the same Debit minus Credit as for one invoice. `invoices` is a list of
// { debit, credit } texts (blank means none). An invoice that cannot be counted is left out of the
// sums and listed in `skipped` with the reason, so one bad amount never blocks the total:
//   - an amount that is not a valid amount  -> reason is the parse reason (e.g. 'invalid')
//   - both amounts blank                    -> reason 'nothing'
// Returns { ok: true, ...calculateNet's fields, counted, skipped: [{ index, reason, message }] }
// or { ok: false, reason: 'nothing', message, counted: 0, skipped } when no invoice can be counted.
// The sums may be larger than one amount is allowed to be; nothing is rounded.
export function calculateTotals(invoices = []) {
  let debit = 0n;
  let credit = 0n;
  let counted = 0;
  const skipped = [];
  invoices.forEach((invoice, index) => {
    const one = calculateNet({ debit: invoice?.debit, credit: invoice?.credit });
    if (!one.ok) {
      skipped.push({ index, reason: one.reason, message: one.message });
      return;
    }
    // calculateNet already checked both amounts; parse again for the exact units.
    for (const field of ['debit', 'credit']) {
      const value = invoice[field];
      const units = isMissing(value) ? 0n : parseAmount(String(value)).units;
      if (field === 'debit') debit += units;
      else credit += units;
    }
    counted += 1;
  });
  if (counted === 0) {
    return {
      ok: false,
      reason: 'nothing',
      message: 'No invoice has an amount yet. Add an invoice, or type its Debit or Credit.',
      counted,
      skipped,
    };
  }
  return { ...netResult(debit, credit), counted, skipped };
}
