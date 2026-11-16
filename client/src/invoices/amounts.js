// Checks an amount typed into the Debit or Credit box. Amounts stay as text (never floats) and
// follow CALC-1: 0 or more, up to 2 decimals. A blank box is allowed: it means "none".
// Returns { ok: true, value } (value is a clean "1250.50", or "" for blank) or { ok: false, message }.
export function checkAmount(text) {
  const raw = String(text ?? '').trim();
  if (raw === '') return { ok: true, value: '' };
  if (/^[-−(]/.test(raw)) return { ok: false, message: 'Amounts cannot be negative.' };

  // Allow thousands commas the way people type them: 1,250.50
  const plain = /^\d{1,3}(,\d{3})+(\.\d*)?$/.test(raw) ? raw.replaceAll(',', '') : raw;
  if (!/^\d+(\.\d*)?$/.test(plain)) {
    return { ok: false, message: 'Enter a number such as 1250.50.' };
  }
  const [whole, frac = ''] = plain.split('.');
  if (frac.length > 2) return { ok: false, message: 'Use at most 2 decimal places.' };
  if (whole.replace(/^0+(?=\d)/, '').length > 12) {
    return { ok: false, message: 'That amount is too large.' };
  }
  return { ok: true, value: `${whole.replace(/^0+(?=\d)/, '')}.${frac.padEnd(2, '0')}` };
}
