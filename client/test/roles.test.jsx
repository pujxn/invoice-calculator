import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, storeSession, stubApi } from './helpers.jsx';

vi.mock('../src/invoices/invoiceApi.js', () => ({
  uploadInvoice: vi.fn(),
  getInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  fetchInvoiceImage: vi.fn(),
  extractInvoice: vi.fn(),
}));

const where = () => screen.getByTestId('where').textContent;
const ME = { phone: '+919876500002', name: 'Asha Rao', expiresAt: 'x' };
const summary = (over = {}) => ({
  count: 2,
  debit: '1250800.50',
  credit: '2000.25',
  net: '1248800.25',
  signedNet: '1248800.25',
  type: 'debit',
  ...over,
});
const entry = (over = {}) => ({
  id: 'ent_1',
  debit: '1250.50',
  credit: '400.00',
  net: '850.50',
  type: 'debit',
  method: 'ocr',
  createdAt: '2026-11-19T10:00:00.000Z',
  ...over,
});
const agent = (over = {}) => ({
  phone: '+919876500002',
  name: 'Asha Rao',
  active: true,
  addedAt: '2026-11-19T09:00:00.000Z',
  removedAt: null,
  ...summary(),
  ...over,
});

let user;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  user = userEvent.setup();
});

describe('roles in the web app', () => {
  it('an agent sees New invoice and History, with their name, and no Agents link', async () => {
    storeSession();
    stubApi({ 'GET /auth/me': [200, { ...ME, role: 'agent' }] });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Welcome, Asha Rao' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'New invoice' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'History' })).toHaveAttribute('href', '/history');
    expect(within(nav).queryByRole('link', { name: 'Agents' })).toBeNull();
  });

  it('a superadmin is taken from the home page to the Agents page', async () => {
    storeSession();
    stubApi({
      'GET /auth/me': [200, { ...ME, role: 'superadmin', name: 'Superadmin' }],
      'GET /agents': [
        200,
        {
          agents: [],
          total: summary({
            count: 0,
            debit: '0.00',
            credit: '0.00',
            net: '0.00',
            type: 'balanced',
          }),
        },
      ],
    });
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Agents' })).toBeInTheDocument();
    expect(where()).toBe('/admin');
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).queryByRole('link', { name: 'History' })).toBeNull();
  });

  it('pages for the other role send people home', async () => {
    storeSession();
    stubApi({ 'GET /auth/me': [200, { ...ME, role: 'agent' }] });
    renderApp('/admin');
    await waitFor(() => expect(where()).toBe('/'));
  });
});

describe('Agents page (superadmin)', () => {
  const total = summary({ count: 3 });
  function boot(handlers = {}) {
    storeSession();
    return stubApi({
      'GET /auth/me': [200, { ...ME, role: 'superadmin', name: 'Superadmin' }],
      'GET /agents': [
        200,
        {
          agents: [
            agent(),
            agent({
              phone: '+919876500003',
              name: 'Ravi',
              count: 0,
              debit: '0.00',
              credit: '0.00',
              net: '0.00',
              type: 'balanced',
            }),
            agent({
              phone: '+919876500004',
              name: 'Gone Agent',
              active: false,
              removedAt: '2026-11-19T10:00:00.000Z',
            }),
          ],
          total,
        },
      ],
      ...handlers,
    });
  }

  it('shows the overall total, each agent’s figures, and removed agents apart', async () => {
    boot();
    renderApp('/admin');
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByTestId('totals-net')).toHaveTextContent('₹12,48,800.25');
    const rows = screen.getAllByTestId('agent');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('+919876500002');
    expect(rows[0]).toHaveTextContent('₹12,50,800.50');
    expect(rows[1]).toHaveTextContent('Ravi');
    expect(rows[1]).toHaveTextContent('₹0.00');
    expect(screen.getByTestId('removed-agent')).toHaveTextContent('Gone Agent');
    expect(screen.getAllByRole('link', { name: 'View list' })[0]).toHaveAttribute(
      'href',
      '/admin/agents/%2B919876500002',
    );
  });

  it('adds an agent with the typed name and number, then refreshes', async () => {
    const api = boot({
      'POST /agents': (body) => [
        201,
        { agent: agent({ phone: body.phone, name: body.name }), restored: false },
      ],
    });
    renderApp('/admin');
    await screen.findByText('Asha Rao');
    const add = screen.getByRole('button', { name: 'Add agent' });
    expect(add).toBeDisabled();
    await user.type(screen.getByLabelText('Name'), 'Meera');
    await user.type(screen.getByLabelText('Mobile number'), '+91 98765 00005');
    await user.click(add);
    expect(await screen.findByText(/Meera was added/)).toBeInTheDocument();
    const post = api.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({ name: 'Meera', phone: '+91 98765 00005' });
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });

  it('shows the server’s reason when adding fails', async () => {
    boot({ 'POST /agents': [409, { error: 'That number is already an agent (Asha Rao).' }] });
    renderApp('/admin');
    await screen.findByText('Asha Rao');
    await user.type(screen.getByLabelText('Name'), 'Asha');
    await user.type(screen.getByLabelText('Mobile number'), '+919876500002');
    await user.click(screen.getByRole('button', { name: 'Add agent' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already an agent');
  });

  it('asks before removing an agent', async () => {
    const api = boot({
      'DELETE /agents/%2B919876500002': [200, { agent: agent({ active: false }) }],
    });
    renderApp('/admin');
    await screen.findByText('Asha Rao');
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.getByText(/Their list is kept/)).toBeInTheDocument();
    expect(api.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Yes, remove' }));
    expect(await screen.findByText(/Asha Rao was removed/)).toBeInTheDocument();
  });

  it('shows more of an agent’s list a page at a time, with totals for all of it', async () => {
    const api = boot({
      'GET /agents/%2B919876500002?limit=50&offset=0': [
        200,
        { agent: agent(), entries: [entry()], total: 3, limit: 50, offset: 0 },
      ],
      'GET /agents/%2B919876500002?limit=50&offset=1': [
        200,
        {
          agent: agent(),
          entries: [entry({ id: 'ent_2' }), entry({ id: 'ent_3' })],
          total: 3,
          limit: 50,
          offset: 1,
        },
      ],
    });
    renderApp('/admin/agents/%2B919876500002');
    await screen.findByRole('heading', { name: 'Asha Rao' });
    expect(screen.getAllByTestId('entry')).toHaveLength(1);
    expect(screen.getByTestId('totals-count')).toHaveTextContent('2'); // the agent's count, not the page's
    await user.click(screen.getByRole('button', { name: 'Show more (2 left)' }));
    await waitFor(() => expect(screen.getAllByTestId('entry')).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull();
    expect(api.mock.calls.length).toBeGreaterThan(2);
  });

  it('opens one agent’s list, read only', async () => {
    boot({
      'GET /agents/%2B919876500002?limit=50&offset=0': [
        200,
        {
          agent: agent(),
          total: 2,
          entries: [
            entry(),
            entry({ id: 'ent_2', type: 'credit', net: '12.345', debit: '0.00', credit: '12.345' }),
          ],
        },
      ],
    });
    renderApp('/admin/agents/%2B919876500002');
    expect(await screen.findByRole('heading', { name: 'Asha Rao' })).toBeInTheDocument();
    const rows = screen.getAllByTestId('entry');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent('Net Credit ₹12.345'); // every decimal is shown
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(screen.getByRole('link', { name: '← All agents' })).toHaveAttribute('href', '/admin');
  });
});
