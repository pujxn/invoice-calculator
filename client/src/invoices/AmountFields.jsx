import { AMOUNT_HINT, FLAG_TEXT, amountFlag, checkAmount } from './amounts.js';

// The two boxes for the Debit and Credit amounts, with their checks. Used on the review screen
// and again on the result screen, so the amounts can be changed in either place.
// `result` is what was read from the picture; `values` are the (possibly edited) texts.
// Each amount that was read carries a flag: High confidence (green) or Low confidence (pink,
// please double-check). The flag goes once the person changes the amount.
export default function AmountFields({ result, values, onChange, idPrefix = 'amount' }) {
  const manual = result.provider === 'manual';
  return (
    <form className="amounts" onSubmit={(e) => e.preventDefault()} noValidate>
      {['debit', 'credit'].map((field) => {
        const check = checkAmount(values[field]);
        const label = field === 'debit' ? 'Debit' : 'Credit';
        const missing = !manual && result[field] === null && values[field] === '';
        const flag = amountFlag(result, field, values[field]);
        const flagId = `${idPrefix}-${field}-flag`;
        return (
          <div className="field" key={field}>
            <label htmlFor={`${idPrefix}-${field}`}>
              {label}
              <span className="hint"> (₹)</span>
              {flag && (
                <span className={`flag ${flag}`} data-testid={`${field}-flag`} data-flag={flag}>
                  {FLAG_TEXT[flag].badge}
                </span>
              )}
            </label>
            <input
              id={`${idPrefix}-${field}`}
              name={field}
              inputMode="decimal"
              autoComplete="off"
              placeholder="None"
              value={values[field]}
              onChange={(e) => onChange(field, e.target.value)}
              aria-invalid={!check.ok}
              className={flag ? `flagged-${flag}` : undefined}
              aria-describedby={`${idPrefix}-${field}-hint${flag ? ` ${flagId}` : ''}`}
            />
            {flag && (
              <p id={flagId} className={`flag-hint ${flag}`}>
                {FLAG_TEXT[flag].hint}
              </p>
            )}
            <p
              id={`${idPrefix}-${field}-hint`}
              className={check.ok ? 'hint' : 'field-error'}
              role={check.ok ? undefined : 'alert'}
            >
              {check.ok
                ? missing
                  ? `No ${label} amount found. Leave blank if the invoice has none.`
                  : values[field] === ''
                    ? 'Blank counts as none.'
                    : ' '
                : check.message}
            </p>
          </div>
        );
      })}
      <p className="hint amount-limits" id={`${idPrefix}-limits`}>
        {AMOUNT_HINT}
      </p>
    </form>
  );
}
