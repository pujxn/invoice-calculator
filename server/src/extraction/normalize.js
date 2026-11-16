import { parseAmount, sumAmounts, toCents } from './money.js';

const LEVELS = ['low', 'medium', 'high'];
const lower = (a, b) => (LEVELS.indexOf(a) <= LEVELS.indexOf(b) ? a : b);

// Turns the validated model answer into what the API returns: exact decimal strings,
// line items with their totals, and a list of warnings for anything the user should check.
// A value we cannot read with certainty becomes null (the user types it) plus a warning.
export function normalizeExtraction(model) {
  const warnings = [];
  let confidence = model.confidence;

  const amount = (field, raw) => {
    const parsed = parseAmount(raw);
    if (parsed.ok) return parsed.value;
    warnings.push({ field, code: parsed.reason, message: parsed.message });
    confidence = lower(confidence, 'low');
    return null;
  };
  const debit = amount('debit', model.debit);
  const credit = amount('credit', model.credit);

  const lineItems = [];
  for (const item of model.lineItems) {
    const parsed = parseAmount(item.amount);
    if (!parsed.ok || parsed.value === null) {
      warnings.push({
        field: 'items',
        code: parsed.ok ? 'invalid' : parsed.reason,
        message: `Skipped the line "${item.description || '(no description)'}": ${
          parsed.ok ? 'it has no amount.' : parsed.message
        }`,
      });
      continue;
    }
    lineItems.push({ description: item.description, column: item.column, amount: parsed.value });
  }

  let itemTotals = null;
  if (lineItems.length > 0) {
    const total = (column) =>
      sumAmounts(lineItems.filter((i) => i.column === column).map((i) => i.amount));
    itemTotals = { debit: total('debit'), credit: total('credit') };
    for (const field of ['debit', 'credit']) {
      const stated = field === 'debit' ? debit : credit;
      const hasItems = lineItems.some((i) => i.column === field);
      if (stated !== null && hasItems && toCents(stated) !== toCents(itemTotals[field])) {
        warnings.push({
          field,
          code: 'items_mismatch',
          message: `The ${field} total (${stated}) does not match the ${field} lines, which add up to ${itemTotals[field]}. Please check.`,
        });
        confidence = lower(confidence, 'medium');
      }
      if (stated === null && hasItems) {
        warnings.push({
          field,
          code: 'total_missing',
          message: `No ${field} total was found, but the ${field} lines add up to ${itemTotals[field]}.`,
        });
      }
    }
  }

  if (debit === null && credit === null && !warnings.some((w) => w.field !== 'items')) {
    warnings.push({
      field: 'general',
      code: 'no_amounts',
      message: 'No Debit or Credit amount was found in this picture. You can type them in.',
    });
  }

  return {
    debit,
    credit,
    currency: model.currency,
    confidence,
    notes: model.notes,
    warnings,
    lineItems,
    itemTotals,
  };
}
