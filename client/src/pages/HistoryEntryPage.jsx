import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatAmount } from '@ledgerly/money';
import { ApiError } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import SignedInHeader from '../components/SignedInHeader.jsx';
import { formatWhen } from '../history/dates.js';
import { deleteHistoryEntry, getHistoryEntry } from '../history/historyApi.js';
import { whenSaved } from '../history/inflight.js';
import { describeEntry, METHOD_LABELS } from '../history/labels.js';
import useDocumentTitle from '../useDocumentTitle.js';

// One saved invoice: the final amount as it was worked out, the two amounts, when it was saved
// and how it was read. The picture is deleted as soon as it is read, so only a reference to it
// is kept and the page says so.
export default function HistoryEntryPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle('Saved invoice');
  const headingRef = useRef(null);
  const [entry, setEntry] = useState(null);
  const [problem, setProblem] = useState(null); // { missing: boolean, message }
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copy, setCopy] = useState('');

  useEffect(() => {
    let cancelled = false;
    whenSaved()
      .then(() => getHistoryEntry(id, token))
      .then((found) => !cancelled && setEntry(found))
      .catch(
        (err) =>
          !cancelled &&
          setProblem({
            missing: err instanceof ApiError && err.status === 404,
            message: err.message,
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [id, token]);

  // The heading only exists once the invoice (or the problem) has loaded; focus moves to it then,
  // so a screen reader announces what opened.
  const loaded = Boolean(entry || problem);
  useEffect(() => {
    if (loaded) headingRef.current?.focus({ preventScroll: true });
  }, [loaded]);

  const words = entry ? describeEntry(entry) : null;
  const money = (value) => formatAmount(value, { exact: true });

  async function remove() {
    setBusy(true);
    try {
      await deleteHistoryEntry(entry.id, token);
      navigate('/history', { replace: true });
    } catch (err) {
      setBusy(false);
      setConfirming(false);
      setProblem({ missing: false, message: err.message });
    }
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(words.text);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  return (
    <>
      <SignedInHeader />
      <main className="shell">
        {!entry && !problem && (
          <p role="status" className="hint">
            Loading…
          </p>
        )}

        {problem && (
          <section aria-labelledby="entry-problem">
            <h1 id="entry-problem" ref={headingRef} tabIndex={-1}>
              {problem.missing ? 'Invoice not found' : 'Could not open this invoice'}
            </h1>
            <p role="alert">
              {problem.missing
                ? 'This saved invoice does not exist any more. It may have been deleted.'
                : problem.message}
            </p>
            <div className="actions">
              <Link to="/history" className="button">
                Back to history
              </Link>
            </div>
          </section>
        )}

        {entry && words && (
          <section className="final-screen" aria-labelledby="entry-title">
            <h1 id="entry-title" ref={headingRef} tabIndex={-1}>
              Saved invoice
            </h1>
            <p className="hint">
              Saved{' '}
              <time dateTime={entry.createdAt} data-testid="entry-saved">
                {formatWhen(entry.createdAt)}
              </time>
            </p>

            <div className={`final ${entry.type}`} data-testid="final">
              <p className="final-label">{words.label}</p>
              <p className="final-amount">{words.amount}</p>
              {words.note && <p className="final-note">{words.note}</p>}
              <p className="final-working">{words.working}</p>
            </div>

            <div className="items breakdown">
              <table>
                <caption>How it was worked out</caption>
                <tbody>
                  <tr>
                    <th scope="row">Debit</th>
                    <td className="num">{money(entry.debit)}</td>
                  </tr>
                  <tr>
                    <th scope="row">Minus Credit</th>
                    <td className="num">{money(entry.credit)}</td>
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

            <h2>Details</h2>
            <dl className="details">
              <dt>Read with</dt>
              <dd>{METHOD_LABELS[entry.method] ?? entry.method}</dd>
              {entry.updatedAt !== entry.createdAt && (
                <>
                  <dt>Amounts last changed</dt>
                  <dd>{formatWhen(entry.updatedAt)}</dd>
                </>
              )}
              <dt>Picture</dt>
              <dd>
                {entry.imageRef && entry.method === 'manual' ? (
                  'The amounts were typed by hand. The picture was deleted without being read.'
                ) : entry.imageRef ? (
                  <>
                    Reference <code>{entry.imageRef.slice(0, 8)}</code>. The picture itself was
                    deleted after it was read.
                  </>
                ) : (
                  'None. The amounts were typed by hand.'
                )}
              </dd>
            </dl>

            <p className="hint copy-status" role="status">
              {copy === 'copied' && 'Copied to the clipboard.'}
              {copy === 'failed' &&
                'Your browser would not let us copy. Select the amount and copy it by hand.'}
            </p>

            {confirming ? (
              <div className="status bad" role="alertdialog" aria-label="Delete this invoice?">
                <p>Delete this invoice from your history? This cannot be undone.</p>
                <div className="actions">
                  <button type="button" onClick={remove} disabled={busy}>
                    {busy ? 'Deleting…' : 'Yes, delete it'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setConfirming(false)}
                    disabled={busy}
                  >
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <div className="actions">
                <button type="button" onClick={copyResult}>
                  Copy result
                </button>
                <Link to="/history" className="button secondary">
                  Back to history
                </Link>
                <button type="button" className="secondary" onClick={() => setConfirming(true)}>
                  Delete
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </>
  );
}
