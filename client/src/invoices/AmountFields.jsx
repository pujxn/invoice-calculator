import { checkAmount } from './amounts.js';

// The two boxes for the Debit and Credit amounts, with their checks. Used on the review screen
// and again on the result screen, so the amounts can be changed in either place.
// `result` is what was read from the picture; `values` are the (possibly edited) texts.
export default function AmountFields({ result, values, onChange, idPrefix = 'amount' }) {
  const manual = result.provider === 'manual';
  const currency = result.currency;
  return (
    <form className="amounts" onSubmit={(e) => e.preventDefault()} noValidate>
      {['debit', 'credit'].map((field) => {
        const check = checkAmount(values[field]);
        const label = field === 'debit' ? 'Debit' : 'Credit';
        const missing = !manual && result[field] === null && values[field] === '';
        return (
          <div className="field" key={field}>
            <label htmlFor={`${idPrefix}-${field}`}>
              {label}
              {currency && <span className="hint"> ({currency})</span>}
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
              aria-describedby={`${idPrefix}-${field}-hint`}
            />
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
    </form>
  );
}
