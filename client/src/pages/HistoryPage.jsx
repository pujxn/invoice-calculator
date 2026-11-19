import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatAmount, LABELS } from '@ledgerly/money';
import { useAuth } from '../auth/AuthContext.jsx';
import AppHeader from '../components/AppHeader.jsx';
import { dayEnd, dayStart, formatWhen } from '../history/dates.js';
import { listHistory } from '../history/historyApi.js';
import { whenSaved } from '../history/inflight.js';
import { TYPE_OPTIONS } from '../history/labels.js';
import useDocumentTitle from '../useDocumentTitle.js';

const PAGE = 20;
const NO_FILTERS = { q: '', type: '', from: '', to: '' };

// Every invoice that was read and worked out, newest first, with a search box and filters for the
// kind of result and the dates. Opening one shows its details (HistoryEntryPage).
export default function HistoryPage() {
  const { token, logout } = useAuth();
  useDocumentTitle('History');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [applied, setApplied] = useState(NO_FILTERS); // `filters` after the typing pause
  const [data, setData] = useState({ entries: [], total: 0 });
  const [state, setState] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0); // only the newest request may change the screen

  // Text boxes wait a moment after the last key; the type and dates apply at once.
  useEffect(() => {
    const timer = setTimeout(() => setApplied(filters), 300);
    return () => clearTimeout(timer);
  }, [filters]);

  const rangeWrong = filters.from && filters.to && filters.from > filters.to;

  const load = useCallback(
    async (offset) => {
      const mine = ++request.current;
      if (offset === 0) setState('loading');
      else setLoadingMore(true);
      try {
        await whenSaved(); // a correction that is still being saved shows up in the list
        const page = await listHistory(
          {
            q: applied.q.trim(),
            type: applied.type,
            from: dayStart(applied.from),
            to: dayEnd(applied.to),
            limit: PAGE,
            offset,
          },
          token,
        );
        if (mine !== request.current) return;
        setData((old) => ({
          total: page.total,
          entries: offset === 0 ? page.entries : [...old.entries, ...page.entries],
        }));
        setState('ready');
      } catch (err) {
        if (mine !== request.current) return;
        setError(err.message);
        setState('error');
      } finally {
        if (mine === request.current) setLoadingMore(false);
      }
    },
    [applied, token],
  );

  useEffect(() => {
    if (rangeWrong) return;
    load(0);
  }, [load, rangeWrong]);

  const set = (field) => (e) => setFilters((f) => ({ ...f, [field]: e.target.value }));
  const filtered = Object.keys(NO_FILTERS).some((k) => applied[k] !== '');

  return (
    <>
      <AppHeader>
        <Link to="/" className="button secondary">
          New invoice
        </Link>
        <button type="button" className="secondary" onClick={logout}>
          Sign out
        </button>
      </AppHeader>
      <main className="shell">
        <h1>History</h1>

        <form className="history-filters" role="search" onSubmit={(e) => e.preventDefault()}>
          <label htmlFor="history-q">Search</label>
          <input
            id="history-q"
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="An amount, or debit, credit, balanced"
            value={filters.q}
            onChange={set('q')}
          />
          <label htmlFor="history-type">Show</label>
          <select id="history-type" value={filters.type} onChange={set('type')}>
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="date-row">
            <div>
              <label htmlFor="history-from">From</label>
              <input id="history-from" type="date" value={filters.from} onChange={set('from')} />
            </div>
            <div>
              <label htmlFor="history-to">To</label>
              <input id="history-to" type="date" value={filters.to} onChange={set('to')} />
            </div>
          </div>
          {rangeWrong && (
            <p className="field-error" role="alert">
              The From date is after the To date.
            </p>
          )}
          {Object.keys(NO_FILTERS).some((k) => filters[k] !== '') && (
            <button
              type="button"
              className="secondary clear-filters"
              onClick={() => {
                setFilters(NO_FILTERS);
                setApplied(NO_FILTERS);
              }}
            >
              Clear search and filters
            </button>
          )}
        </form>

        <div role="status" className="hint history-count" data-testid="history-count">
          {state === 'loading' && 'Loading…'}
          {state === 'ready' &&
            data.total > 0 &&
            `Showing ${data.entries.length} of ${data.total} ${data.total === 1 ? 'invoice' : 'invoices'}`}
        </div>

        {state === 'error' && (
          <div className="status bad" role="alert">
            <p>{error}</p>
            <button type="button" className="secondary" onClick={() => load(0)}>
              Try again
            </button>
          </div>
        )}

        {state === 'ready' && data.total === 0 && (
          <div className="note" data-testid="history-empty">
            {filtered ? (
              <p>No saved invoices match. Try a different search or dates.</p>
            ) : (
              <p>
                Nothing saved yet. Every invoice you read is saved here once you reach its final
                amount.
              </p>
            )}
          </div>
        )}

        {data.entries.length > 0 && (
          <ul className="history-list" aria-label="Saved invoices">
            {data.entries.map((entry) => (
              <li key={entry.id}>
                <Link to={`/history/${entry.id}`} className={`history-item ${entry.type}`}>
                  <time dateTime={entry.createdAt} className="history-when">
                    {formatWhen(entry.createdAt)}
                  </time>
                  <span className="history-label">{LABELS[entry.type]}</span>
                  <span className="history-amount">{formatAmount(entry.net)}</span>
                  <span className="history-sides">
                    Debit {formatAmount(entry.debit)} · Credit {formatAmount(entry.credit)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {state === 'ready' && data.entries.length < data.total && (
          <div className="actions">
            <button
              type="button"
              className="secondary"
              onClick={() => load(data.entries.length)}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading…' : 'Show more'}
            </button>
          </div>
        )}
      </main>
    </>
  );
}
