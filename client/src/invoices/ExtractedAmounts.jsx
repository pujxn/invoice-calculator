import { useState } from 'react';
import { calculateNet } from '@ledgerly/money';
import useFocusOnMount from '../useFocusOnMount.js';
import AmountFields from './AmountFields.jsx';
import { methodName } from './ReadingMethod.jsx';

const CONFIDENCE = { high: 'High', medium: 'Medium', low: 'Low' };

// Shows what was read from the picture: the Debit and Credit boxes (editable), anything to
// double check. The values live in the parent so they
// survive a reload; this component only draws them.
export default function ExtractedAmounts({
  result,
  values,
  onChange,
  onReset,
  onStartOver,
  onCalculate,
}) {
  const headingRef = useFocusOnMount();
  const [problem, setProblem] = useState('');
  const edited = ['debit', 'credit'].some((f) => values[f] !== (result[f] ?? ''));
  const demo = result.provider === 'mock';
  const manual = result.provider === 'manual';

  function calculate() {
    const outcome = calculateNet(values);
    if (outcome.ok) onCalculate();
    else setProblem(outcome.message);
  }

  return (
    <section className="results" aria-labelledby="results-title">
      <h2 id="results-title" ref={headingRef} tabIndex={-1}>
        {manual ? 'Enter the amounts' : 'Amounts we found'}
      </h2>
      <p className="hint">
        {manual
          ? 'Type the Debit and Credit from your invoice. Leave one blank if the invoice has none.'
          : `${
              demo
                ? 'Demo values, not read from your picture.'
                : result.provider === 'ocr'
                  ? 'Read from your picture with local OCR (free, no AI).'
                  : 'Read from your picture by AI.'
            } Check them against your invoice and correct anything that is wrong.`}
      </p>

      {!manual && (
        <p className={`confidence ${result.confidence}`}>
          Read with: <strong data-testid="read-with">{methodName(result.provider)}</strong> ·
          Confidence: <strong>{CONFIDENCE[result.confidence]}</strong> · Amounts in rupees (
          <strong>₹</strong>)
        </p>
      )}

      {/* In demo mode the line under the heading already says so; the server's note would repeat it. */}
      {result.notes && !demo && <p className="note">{result.notes}</p>}

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

      <AmountFields
        result={result}
        values={values}
        onChange={(field, text) => {
          setProblem('');
          onChange(field, text);
        }}
      />

      {problem && (
        <div className="status bad" role="alert">
          {problem}
        </div>
      )}

      <div className="actions">
        <button type="button" onClick={calculate}>
          Calculate final amount
        </button>
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
