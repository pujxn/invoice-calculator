import { toUnits, unitsToString } from '@ledgerly/money';

// Adds up saved entries exactly (BigInt rupee units, no rounding). Returns { count, debit, credit, net, signedNet, type } with `net`
// never negative and `type` "debit", "credit" or "balanced", like the calculation.
export function summarize(entries) {
  let debit = 0n;
  let credit = 0n;
  let count = 0;
  for (const entry of entries) {
    count += 1;
    debit += toUnits(entry.debit);
    credit += toUnits(entry.credit);
  }
  const signed = debit - credit;
  return {
    count,
    debit: unitsToString(debit),
    credit: unitsToString(credit),
    net: unitsToString(signed < 0n ? -signed : signed),
    signedNet: unitsToString(signed),
    type: signed > 0n ? 'debit' : signed < 0n ? 'credit' : 'balanced',
  };
}
