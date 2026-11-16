import { useState } from 'react';
import { calculateNet, describeResult, formatAmount } from '@ledgerly/money';
import useFocusOnMount from '../useFocusOnMount.js';
import AmountFields from './AmountFields.jsx';

// Step 5: the final amount. It is worked out here in the browser from the two boxes on every
// keystroke, with the same exact-decimal code the server uses, so the result updates as the
// amounts are corrected and keeps working with no network.
export default function ResultScreen({ result, values, onChange, onReset, onBack, onStartOver }) {
  const headingRef = useFocusOnMount();
  const [copy, setCopy] = useState(''); // '', 'copied' or 'failed'
  const currency = result.currency;
  const outcome = calculateNet(values);
  const words = outcome.ok ? describeResult(outcome, currency) : null;
  const edited = ['debit', 'credit'].some((f) => values[f] !== (result[f] ?? ''));
  const money = (value) => formatAmount(value, currency);

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(words.text);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  return (
    <section className="final-screen" aria-labelledby="final-title">
      <h2 id="final-title" ref={headingRef} tabIndex={-1}>
        Final amount
      </h2>

      {/* Announced politely each time the figure changes while an amount is being edited. */}
      <div
        className={`final ${outcome.ok ? outcome.type : 'none'}`}
        data-testid="final"
        aria-live="polite"
        aria-atomic="true"
      >
        {outcome.ok ? (
          <>
            <p className="final-label">{words.label}</p>
            <p className="final-amount">{words.amount}</p>
            <p className="final-working">{words.working}</p>
          </>
        ) : (
          <>
            <p className="final-label">No final amount yet</p>
            <p className="final-working">{outcome.message}</p>
          </>
        )}
      </div>

      {outcome.ok && (
        <div className="items breakdown">
          <table>
            <caption>How it was worked out</caption>
            <tbody>
              <tr>
                <th scope="row">Debit</th>
                <td className="num">{money(outcome.debit)}</td>
              </tr>
              <tr>
                <th scope="row">Minus Credit</th>
                <td className="num">{money(outcome.credit)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{words.label}</th>
                <td className="num">{words.amount}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <h3>Change an amount</h3>
      <p className="hint">
        Correct either amount and the final amount above updates straight away.
      </p>
      <AmountFields
        result={result}
        values={values}
        onChange={(field, text) => {
          setCopy('');
          onChange(field, text);
        }}
        idPrefix="final"
      />

      <p className="hint copy-status" role="status">
        {copy === 'copied' && 'Copied to the clipboard.'}
        {copy === 'failed' &&
          'Your browser would not let us copy. Select the amount and copy it by hand.'}
      </p>

      <div className="actions">
        <button type="button" onClick={copyResult} disabled={!outcome.ok}>
          Copy result
        </button>
        {edited && (
          <button type="button" className="secondary" onClick={onReset}>
            Reset to what was found
          </button>
        )}
        <button type="button" className="secondary" onClick={onBack}>
          Back to the invoice
        </button>
        <button type="button" className="secondary" onClick={onStartOver}>
          Start a new invoice
        </button>
      </div>
    </section>
  );
}
