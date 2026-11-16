import { checkAmount } from './amounts.js';

const CONFIDENCE = { high: 'High', medium: 'Medium', low: 'Low' };

// Shows what was read from the picture: the Debit and Credit boxes (editable), anything to
// double check, and the lines found on the invoice. The values live in the parent so they
// survive a reload; this component only draws them.
export default function ExtractedAmounts({ result, values, onChange, onReset, onStartOver }) {
  const checks = {
    debit: checkAmount(values.debit),
    credit: checkAmount(values.credit),
  };
  const edited = ['debit', 'credit'].some((f) => values[f] !== (result[f] ?? ''));
  const demo = result.provider === 'mock';
  const manual = result.provider === 'manual';
  const currency = result.currency;
  const hasItems = result.lineItems.length > 0;

  return (
    <section className="results" aria-labelledby="results-title">
      <h2 id="results-title">{manual ? 'Enter the amounts' : 'Amounts we found'}</h2>
      <p className="hint">
        {manual
          ? 'Type the Debit and Credit from your invoice. Leave one blank if the invoice has none.'
          : `${
              demo
                ? 'Demo values (no AI key is set), not read from your picture.'
                : 'Read from your picture by AI.'
            } Check them against your invoice and correct anything that is wrong.`}
      </p>

      {!manual && (
        <p className={`confidence ${result.confidence}`}>
          Confidence: <strong>{CONFIDENCE[result.confidence]}</strong>
          {currency && (
            <>
              {' '}
              · Currency: <strong>{currency}</strong>
            </>
          )}
        </p>
      )}

      {result.notes && <p className="note">{result.notes}</p>}

      {result.warnings.length > 0 && (
        <div className="status warn" role="alert">
          <strong>Please check:</strong>
          <ul>
            {result.warnings.map((w, i) => (
              <li key={`${w.code}-${i}`}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      <form className="amounts" onSubmit={(e) => e.preventDefault()} noValidate>
        {['debit', 'credit'].map((field) => {
          const check = checks[field];
          const label = field === 'debit' ? 'Debit' : 'Credit';
          const missing = !manual && result[field] === null && values[field] === '';
          return (
            <div className="field" key={field}>
              <label htmlFor={`amount-${field}`}>
                {label}
                {currency && <span className="hint"> ({currency})</span>}
              </label>
              <input
                id={`amount-${field}`}
                name={field}
                inputMode="decimal"
                autoComplete="off"
                placeholder="None"
                value={values[field]}
                onChange={(e) => onChange(field, e.target.value)}
                aria-invalid={!check.ok}
                aria-describedby={`amount-${field}-hint`}
              />
              <p
                id={`amount-${field}-hint`}
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

      {hasItems && (
        <div className="items">
          <table>
            <caption>Lines found on the invoice</caption>
            <thead>
              <tr>
                <th scope="col">Description</th>
                <th scope="col" className="num">
                  Debit
                </th>
                <th scope="col" className="num">
                  Credit
                </th>
              </tr>
            </thead>
            <tbody>
              {result.lineItems.map((item, i) => (
                <tr key={i}>
                  <th scope="row">{item.description || '(no description)'}</th>
                  <td className="num">{item.column === 'debit' ? item.amount : ''}</td>
                  <td className="num">{item.column === 'credit' ? item.amount : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Lines add up to</th>
                <td className="num">{result.itemTotals.debit}</td>
                <td className="num">{result.itemTotals.credit}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="hint">Working out the final amount comes in the next step.</p>

      <div className="actions">
        {edited && (
          <button type="button" className="secondary" onClick={onReset}>
            Reset to what was found
          </button>
        )}
        <button type="button" className="secondary" onClick={onStartOver}>
          Upload a different invoice
        </button>
      </div>
    </section>
  );
}
