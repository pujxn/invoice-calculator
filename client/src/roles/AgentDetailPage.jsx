import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import SignedInHeader from '../components/SignedInHeader.jsx';
import useDocumentTitle from '../useDocumentTitle.js';
import useFocusOnMount from '../useFocusOnMount.js';
import EntryList from './EntryList.jsx';
import Totals from './Totals.jsx';
import { getAgent } from './rolesApi.js';
import useLoad from './useLoad.js';

// One agent's saved invoices and totals, as the superadmin sees them (read only).
export default function AgentDetailPage() {
  const { token } = useAuth();
  const { phone } = useParams();
  const { data, error, loading } = useLoad(() => getAgent(token, phone));
  const name = data?.agent.name;
  useDocumentTitle(name ? `${name}’s list` : 'Agent');
  const headingRef = useFocusOnMount();

  return (
    <>
      <SignedInHeader />
      <main className="shell wide">
        <p>
          <Link to="/admin">← All agents</Link>
        </p>
        <h1 ref={headingRef} tabIndex={-1}>
          {name ?? 'Agent'}
        </h1>
        {loading && <p role="status">Loading the list…</p>}
        {error && (
          <p className="status bad" role="alert">
            {error}
          </p>
        )}
        {data && (
          <>
            <p className="hint">
              {data.agent.phone}
              {!data.agent.active && ' · Removed: cannot sign in, list kept'}
            </p>
            <Totals summary={data.agent} title={`${data.agent.name}’s total`} />
            {data.entries.length === 0 ? (
              <p className="empty">This agent has not saved any invoices yet.</p>
            ) : (
              <EntryList entries={data.entries} />
            )}
          </>
        )}
      </main>
    </>
  );
}
