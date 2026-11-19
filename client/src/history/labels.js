import { calculateNet, describeResult } from '@ledgerly/money';

// How an invoice was read, in words for the screen.
export const METHOD_LABELS = {
  ocr: 'Local OCR',
  claude: 'AI (Claude)',
  mock: 'Demo reader',
  manual: 'Typed by hand',
};

export const TYPE_OPTIONS = [
  { value: '', label: 'All invoices' },
  { value: 'debit', label: 'Net Debit' },
  { value: 'credit', label: 'Net Credit' },
  { value: 'balanced', label: 'Balanced' },
];

// The words and figures for a saved entry, worked out here from its Debit and Credit with the
// same code as the final amount screen, so a saved invoice reads exactly as it did then.
// Returns the describeResult() fields, or null if the entry's amounts are somehow not valid.
export function describeEntry(entry) {
  const outcome = calculateNet({ debit: entry.debit, credit: entry.credit });
  return outcome.ok ? { ...describeResult(outcome), type: outcome.type, outcome } : null;
}
