import { parseAmount } from './money.js';

const LEVELS = ['low', 'medium', 'high'];
const lower = (a, b) => (LEVELS.indexOf(a) <= LEVELS.indexOf(b) ? a : b);

// Turns the validated model answer into what the API returns: exact decimal strings,
// the Debit and Credit totals, and a list of warnings for anything the user should check.
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

  // How sure we are of each amount, so the screen can flag the ones to double-check. A reader
  // that gives one level for the whole picture (the AI, demo values) counts "high" as high and
  // anything less as low. An empty box has no flag.
  const given = model.amountConfidence;
  const flag = (field, value) => {
    if (value === null) return null;
    if (given) return given[field] === 'high' ? 'high' : 'low';
    return model.confidence === 'high' ? 'high' : 'low';
  };
  const amountConfidence = { debit: flag('debit', debit), credit: flag('credit', credit) };

  if (debit === null && credit === null && warnings.length === 0) {
    warnings.push({
      field: 'general',
      code: 'no_amounts',
      message: 'No Debit or Credit amount was found in this picture. You can type them in.',
    });
  }

  return {
    debit,
    credit,
    currency: 'INR', // Ledgerly works in Indian rupees only
    confidence,
    amountConfidence,
    notes: model.notes,
    warnings,
  };
}
