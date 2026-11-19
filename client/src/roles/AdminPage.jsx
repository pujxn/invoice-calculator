import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatAmount, LABELS } from '@ledgerly/money';
import { useAuth } from '../auth/AuthContext.jsx';
import SignedInHeader from '../components/SignedInHeader.jsx';
import useDocumentTitle from '../useDocumentTitle.js';
import useFocusOnMount from '../useFocusOnMount.js';
import Totals from './Totals.jsx';
import { addAgent, listAgents, removeAgent } from './rolesApi.js';
import useLoad from './useLoad.js';

export function AgentFigures({ agent }) {
  const money = (value) => formatAmount(value, { exact: true });
  return (
    <dl className="agent-figures">
      <div>
        <dt>Debit</dt>
        <dd>{money(agent.debit)}</dd>
      </div>
      <div>
        <dt>Credit</dt>
        <dd>{money(agent.credit)}</dd>
      </div>
      <div>
        <dt>{agent.count ? LABELS[agent.type] : 'Net'}</dt>
        <dd className={`tone-${agent.count ? agent.type : 'balanced'}`}>
          {agent.count ? money(agent.net) : '₹0.00'}
        </dd>
      </div>
      <div>
        <dt>Invoices</dt>
        <dd>{agent.count}</dd>
      </div>
    </dl>
  );
}

// The superadmin's page: the overall total, each agent's totals, and adding and removing agents.
export default function AdminPage() {
  const { token } = useAuth();
  useDocumentTitle('Agents');
  const headingRef = useFocusOnMount();
  const { data, error, loading, reload } = useLoad(() => listAgents(token));
  const [form, setForm] = useState({ name: '', phone: '' });
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(null);

  async function add(e) {
    e.preventDefault();
    setFormError('');
    setNotice('');
    setBusy(true);
    try {
      const res = await addAgent(token, form);
      setNotice(
        res.restored
          ? `${res.agent.name} is back as an agent, with the list they had before.`
          : `${res.agent.name} was added. They can now sign in with ${res.agent.phone}.`,
      );
      setForm({ name: '', phone: '' });
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(agent) {
    setBusy(true);
    setNotice('');
    setFormError('');
    try {
      await removeAgent(token, agent.phone);
      setNotice(`${agent.name} was removed. They can no longer sign in; their list is kept.`);
      setConfirming(null);
      reload();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const active = data?.agents.filter((a) => a.active) ?? [];
  const removed = data?.agents.filter((a) => !a.active) ?? [];

  return (
    <>
      <SignedInHeader />
      <main className="shell wide">
        <h1 ref={headingRef} tabIndex={-1}>
          Agents
        </h1>
        {loading && <p role="status">Loading agents…</p>}
        {error && (
          <p className="status bad" role="alert">
            {error}
          </p>
        )}
        {data && <Totals summary={data.total} title="Overall total, all agents" />}

        <h2>Add an agent</h2>
        <form className="add-agent" onSubmit={add} noValidate>
          <div className="field">
            <label htmlFor="agent-name">Name</label>
            <input
              id="agent-name"
              name="name"
              autoComplete="off"
              maxLength={60}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="agent-phone">Mobile number</label>
            <input
              id="agent-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <button type="submit" disabled={busy || !form.name.trim() || !form.phone.trim()}>
            Add agent
          </button>
        </form>
        <p className="hint">
          Only added numbers can sign in. Include the country code. Adding a removed agent’s number
          again brings their list back.
        </p>
        {formError && (
          <p className="status bad" role="alert">
            {formError}
          </p>
        )}
        {notice && (
          <p className="status good" role="status">
            {notice}
          </p>
        )}

        <h2>Current agents</h2>
        {data && active.length === 0 && (
          <p className="empty">
            No agents yet. Add one above and they can sign in with their number.
          </p>
        )}
        <ul className="agents">
          {active.map((agent) => (
            <li key={agent.phone} className="agent" data-testid="agent">
              <div className="agent-head">
                <p className="agent-name">{agent.name}</p>
                <p className="hint agent-phone">{agent.phone}</p>
              </div>
              <AgentFigures agent={agent} />
              {confirming === agent.phone ? (
                <div className="entry-actions" role="group" aria-label={`Remove ${agent.name}?`}>
                  <span className="hint">
                    Remove {agent.name}? They will be signed out. Their list is kept.
                  </span>
                  <button type="button" disabled={busy} onClick={() => remove(agent)}>
                    Yes, remove
                  </button>
                  <button type="button" className="secondary" onClick={() => setConfirming(null)}>
                    Keep agent
                  </button>
                </div>
              ) : (
                <div className="entry-actions">
                  <Link
                    className="button-link"
                    to={`/admin/agents/${encodeURIComponent(agent.phone)}`}
                  >
                    View list
                  </Link>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setConfirming(agent.phone)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {removed.length > 0 && (
          <>
            <h2>Removed agents</h2>
            <p className="hint">Their saved invoices still count in the overall total.</p>
            <ul className="agents">
              {removed.map((agent) => (
                <li key={agent.phone} className="agent removed" data-testid="removed-agent">
                  <div className="agent-head">
                    <p className="agent-name">{agent.name}</p>
                    <p className="hint agent-phone">{agent.phone}</p>
                  </div>
                  <AgentFigures agent={agent} />
                  <div className="entry-actions">
                    <Link
                      className="button-link"
                      to={`/admin/agents/${encodeURIComponent(agent.phone)}`}
                    >
                      View list
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
