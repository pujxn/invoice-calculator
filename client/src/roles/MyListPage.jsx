import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import SignedInHeader from '../components/SignedInHeader.jsx';
import useDocumentTitle from '../useDocumentTitle.js';
import useFocusOnMount from '../useFocusOnMount.js';
import EntryList from './EntryList.jsx';
import Totals from './Totals.jsx';
import { deleteEntry, listEntries } from './rolesApi.js';
import useLoad from './useLoad.js';

// An agent's own list of saved invoices, with their totals.
export default function MyListPage() {
  const { user, token } = useAuth();
  useDocumentTitle('My list');
  const headingRef = useFocusOnMount();
  const { data, error, loading, setData } = useLoad(() => listEntries(token));
  const [confirming, setConfirming] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');

  async function remove(entry) {
    setBusyId(entry.id);
    setActionError('');
    try {
      const res = await deleteEntry(token, entry.id);
      setData({ entries: data.entries.filter((e) => e.id !== entry.id), summary: res.summary });
      setConfirming(null);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <SignedInHeader />
      <main className="shell">
        <h1 ref={headingRef} tabIndex={-1}>
          My list
        </h1>
        <p>
          Invoices saved by <strong>{user.name || user.phone}</strong>.
        </p>
        {loading && <p role="status">Loading your list…</p>}
        {error && (
          <p className="status bad" role="alert">
            {error}
          </p>
        )}
        {data && (
          <>
            <Totals summary={data.summary} title="Your total" />
            {actionError && (
              <p className="status bad" role="alert">
                {actionError}
              </p>
            )}
            {data.entries.length === 0 ? (
              <p className="empty">
                You have not saved any invoices yet. Read an invoice, then press{' '}
                <strong>Save to my list</strong> on the final amount.
                <br />
                <Link to="/">Start a new invoice</Link>
              </p>
            ) : (
              <EntryList
                entries={data.entries}
                confirming={confirming}
                busyId={busyId}
                onAsk={setConfirming}
                onCancel={() => setConfirming(null)}
                onDelete={remove}
              />
            )}
          </>
        )}
      </main>
    </>
  );
}
