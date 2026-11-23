import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { describeResult, formatAmount } from '@ledgerly/money';
import { useAuth } from '../auth/AuthContext.jsx';
import useFocusOnMount from '../useFocusOnMount.js';
import { FLAG_TEXT, checkAmount } from './amounts.js';
import {
  BUSY,
  canRetry,
  historyStatus,
  itemFlag,
  itemNet,
  needsCheck,
  summarize,
} from './batch.js';
import ReadingMethod, { methodName, useReadingMethod } from './ReadingMethod.jsx';
import useDropZone from './useDropZone.js';
import { ACCEPT, MAX_LABEL, TYPE_LABEL, formatSize } from './validate.js';

const STATUS_TEXT = {
  queued: 'Waiting',
  uploading: 'Sending…',
  reading: 'Reading…',
  done: 'Done',
  failed: 'Failed',
};

// One invoice in the batch: its name, how it is going, and (once read) its own Debit and Credit
// boxes, which can be corrected, and its own net.
function Row({ item, batch, problem }) {
  const { key, name } = item;
  const nameId = `batch-${key}-name`;
  const busy = BUSY.has(item.status);
  const net = item.status === 'done' ? itemNet(item) : null;
  const words = net?.ok ? describeResult(net) : null;
  return (
    <li className={`batch-row ${item.status}`} data-status={item.status} aria-labelledby={nameId}>
      <div className="batch-head">
        <p className="filename" id={nameId}>
          {name} <span className="hint">({formatSize(item.size)})</span>
        </p>
        <span className={`badge ${item.status}`}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {STATUS_TEXT[item.status]}
        </span>
      </div>

      {item.status === 'done' && (
        <>
          <div className="batch-amounts amounts">
            {['debit', 'credit'].map((field) => {
              const label = field === 'debit' ? 'Debit' : 'Credit';
              const check = checkAmount(item[field]);
              const labelId = `batch-${key}-${field}-label`;
              const flag = itemFlag(item, field);
              return (
                <div className="field" key={field}>
                  <label id={labelId} htmlFor={`batch-${key}-${field}`}>
                    {label}
                    <span className="hint"> (₹)</span>
                    {flag && (
                      <span
                        className={`flag ${flag}`}
                        data-testid={`${field}-flag`}
                        data-flag={flag}
                      >
                        {FLAG_TEXT[flag].badge}
                      </span>
                    )}
                  </label>
                  <input
                    id={`batch-${key}-${field}`}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="None"
                    value={item[field]}
                    onChange={(e) => batch.change(key, field, e.target.value)}
                    aria-invalid={!check.ok}
                    className={flag ? `flagged-${flag}` : undefined}
                    aria-labelledby={`${labelId} ${nameId}`}
                    aria-describedby={check.ok ? undefined : `batch-${key}-${field}-error`}
                  />
                  {!check.ok && (
                    <p className="field-error" id={`batch-${key}-${field}-error`} role="alert">
                      {check.message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="batch-net hint" data-testid="row-net">
            {words
              ? `This invoice: ${words.label} ${words.amount}`
              : problem?.reason === 'nothing'
                ? 'Type a Debit or a Credit to count this invoice.'
                : 'Not counted until the amount above is fixed.'}
          </p>
          {needsCheck(item) && (
            <p className="batch-check">
              <strong>Please check</strong> this one against the picture:{' '}
              {item.read.warnings[0]?.message ?? 'an amount was read with low confidence.'}
            </p>
          )}
          {item.read?.provider && item.read.provider !== 'manual' && (
            <p className="hint batch-by">Read with {methodName(item.read.provider)}</p>
          )}
        </>
      )}

      {item.status === 'failed' && (
        <p className="field-error batch-error" role="alert">
          {item.error}
        </p>
      )}

      <div className="batch-actions">
        {item.status === 'failed' && canRetry(item, batch.haveFile(key)) && (
          <button type="button" className="secondary" onClick={() => batch.retry(key)}>
            Retry<span className="sr-only"> {name}</span>
          </button>
        )}
        {item.status === 'failed' && !item.rejected && (
          <button type="button" className="secondary" onClick={() => batch.typeByHand(key)}>
            Type the amounts<span className="sr-only"> for {name}</span>
          </button>
        )}
        <button type="button" className="secondary" onClick={() => batch.remove(key)}>
          Remove<span className="sr-only"> {name}</span>
        </button>
      </div>
    </li>
  );
}

// The one combined total, in the same style as the single-invoice result.
function Total({ summary }) {
  const [copy, setCopy] = useState('');
  const { totals, counted, pending, failed, uncounted, total } = summary;
  const words = totals.ok ? describeResult(totals, { total: true }) : null;
  const money = (v) => formatAmount(v, { exact: true });
  const provisional = pending > 0 || failed > 0 || uncounted > 0;

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(
        `${words.text} across ${counted} invoice${counted === 1 ? '' : 's'}`,
      );
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  const left = [
    pending && `${pending} still being read`,
    failed && `${failed} failed`,
    uncounted && `${uncounted} with no usable amount`,
  ].filter(Boolean);

  return (
    <div className="batch-total">
      <h3>{pending > 0 ? 'Combined total so far' : 'Combined total'}</h3>
      <p className="hint" role="status" data-testid="total-counted">
        {counted === 0
          ? `Nothing counted yet (${total} ${total === 1 ? 'invoice' : 'invoices'} added).`
          : `Counting ${counted} of ${total} ${total === 1 ? 'invoice' : 'invoices'}.`}
        {provisional && counted > 0 && left.length > 0 ? ` Not counted: ${left.join(', ')}.` : ''}
      </p>
      <div
        className={`final ${totals.ok ? totals.type : 'none'}`}
        data-testid="batch-final"
        aria-live="polite"
        aria-atomic="true"
      >
        {totals.ok ? (
          <>
            <p className="final-label">{words.label}</p>
            <p className="final-amount">{words.amount}</p>
            {words.note && <p className="final-note">{words.note}</p>}
            <p className="final-working">{words.working}</p>
          </>
        ) : (
          <>
            <p className="final-label">No combined total yet</p>
            <p className="final-working">{totals.message}</p>
          </>
        )}
      </div>
      {totals.ok && (
        <div className="items breakdown">
          <table>
            <caption>How the total was worked out</caption>
            <tbody>
              <tr>
                <th scope="row">Total debit</th>
                <td className="num" data-testid="total-debit">
                  {money(totals.debit)}
                </td>
              </tr>
              <tr>
                <th scope="row">Minus total credit</th>
                <td className="num" data-testid="total-credit">
                  {money(totals.credit)}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">{words.label}</th>
                <td className="num">{words.exact}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="actions">
        <button type="button" onClick={copyResult} disabled={!totals.ok}>
          Copy total
        </button>
      </div>
      <p className="hint copy-status" role="status">
        {copy === 'copied' && 'Copied to the clipboard.'}
        {copy === 'failed' &&
          'Your browser would not let us copy. Select the amount and copy it by hand.'}
      </p>
    </div>
  );
}

// The batch screen: add many pictures (choose several, or drop them here), watch each one being
// read, fix any amount, and see one combined total. `batch` comes from useBatch.
export default function BatchScreen({ batch, onBack }) {
  const { token } = useAuth();
  const headingRef = useFocusOnMount();
  const { choices, method, choose: chooseMethod } = useReadingMethod(token);
  const input = useRef(null);
  const { over, dropProps } = useDropZone(batch.add);
  const { items } = batch;
  const summary = summarize(items);
  const finished = summary.total - summary.pending;
  const history = historyStatus(items);

  // The way of reading is chosen here but used whenever a picture's turn comes.
  const { setMethod } = batch;
  useEffect(() => setMethod(method), [setMethod, method]);

  function onPick(e) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // the same files can be chosen again
    batch.add(files);
  }
  const retryable = items.filter((i) => canRetry(i, batch.haveFile(i.key))).length;

  return (
    <section className="batch" aria-labelledby="batch-title">
      <h2 id="batch-title" ref={headingRef} tabIndex={-1}>
        Several invoices at once
      </h2>
      <p className="hint">
        Add many invoice pictures together. Each one is read on its own and you get one combined
        total. {TYPE_LABEL}, up to {MAX_LABEL} each.
      </p>

      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        data-testid="batch-input"
        onChange={onPick}
      />

      <ReadingMethod choices={choices} method={method} onChoose={chooseMethod} disabled={false} />

      <div className={`dropzone${over ? ' over' : ''}`} {...dropProps} data-testid="dropzone">
        <p>
          <strong>{over ? 'Drop the pictures to add them' : 'Drop invoice pictures here'}</strong>
          <br />
          <span className="hint">or choose several at once</span>
        </p>
        <div className="actions pick">
          <button type="button" onClick={() => input.current.click()}>
            {items.length ? 'Add more invoices' : 'Choose invoices'}
          </button>
        </div>
      </div>

      {batch.note && (
        <p className="status warn" role="status">
          {batch.note}
        </p>
      )}

      {items.length > 0 && (
        <>
          <div className="batch-progress" role="status" data-testid="batch-progress">
            <progress max={summary.total} value={finished} aria-label="Invoices finished" />
            <p className="hint">
              {summary.pending > 0
                ? `${finished} of ${summary.total} finished…`
                : `All ${summary.total} finished.`}
            </p>
          </div>

          <Total summary={summary} />

          <p className="hint save-status" aria-live="polite" data-testid="history-status">
            {history.failed > 0 ? (
              <>
                Could not save {history.failed} {history.failed === 1 ? 'invoice' : 'invoices'} to
                your history.{' '}
                <button type="button" className="link" onClick={batch.retrySave}>
                  Try again
                </button>
              </>
            ) : history.saving > 0 ? (
              'Saving to history…'
            ) : history.saved > 0 ? (
              <>
                Saved to your history. <Link to="/history">View history</Link>
              </>
            ) : null}
          </p>

          <h3>Your invoices</h3>
          <p className="hint">
            Removing an invoice also removes it from your history. Clear all only empties this
            screen; the invoices stay in your history.
          </p>
          <ul className="batch-list">
            {items.map((item) => (
              <Row
                key={item.key}
                item={item}
                batch={batch}
                problem={summary.problems.get(item.key)}
              />
            ))}
          </ul>
        </>
      )}

      <div className="actions">
        {retryable > 1 && (
          <button type="button" className="secondary" onClick={batch.retryAll}>
            Retry all that failed ({retryable})
          </button>
        )}
        {items.length > 0 && (
          <button type="button" className="secondary" onClick={batch.clear}>
            Clear all
          </button>
        )}
        <button type="button" className="secondary" onClick={onBack}>
          Back to one invoice
        </button>
      </div>
    </section>
  );
}
