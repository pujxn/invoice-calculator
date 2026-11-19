import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import * as invoiceApi from '../src/invoices/invoiceApi.js';
import userEvent from '@testing-library/user-event';
import { HISTORY_ID, renderApp, storeSession, stubApi } from './helpers.jsx';

vi.mock('../src/invoices/invoiceApi.js', () => ({
  uploadInvoice: vi.fn(),
  getInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  fetchInvoiceImage: vi.fn(),
  extractInvoice: vi.fn(),
}));

const ME = { 'GET /auth/me': [200, { phone: '+447700900123', expiresAt: 'x' }] };
const PIC = 'a'.repeat(32);
const KEY = 'invoice-calculator.extracted';
let user;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  user = userEvent.setup({ applyAccept: false });
});

const entry = (over = {}) => ({
  id: 'f'.repeat(32),
  agentId: null,
  createdAt: '2026-11-19T12:30:00.000Z',
  updatedAt: '2026-11-19T12:30:00.000Z',
  debit: '1250.00',
  credit: '400.00',
  net: '850.00',
  netRounded: '850.00',
  type: 'debit',
  imageRef: PIC,
  method: 'ocr',
  ...over,
});

const reading = (over = {}) => ({
  invoiceId: PIC,
  provider: 'ocr',
  debit: '1250.50',
  credit: '400.00',
  currency: 'INR',
  confidence: 'high',
  notes: '',
  warnings: [],
  ...over,
});

// Opens the app on the final amount screen, as if the amounts had just been read.
async function openResult({ result = reading(), values, handlers = {}, historyId } = {}) {
  sessionStorage.setItem(
    KEY,
    JSON.stringify({
      phone: '+447700900123',
      stage: 'result',
      result,
      values: values ?? { debit: result.debit ?? '', credit: result.credit ?? '' },
      ...(historyId ? { historyId } : {}),
    }),
  );
  storeSession();
  const mock = stubApi({ ...ME, ...handlers });
  renderApp('/');
  await screen.findByRole('heading', { name: 'Final amount' });
  return mock;
}

const calls = (mock, method, path) =>
  mock.mock.calls.filter(
    ([url, init]) => (init?.method || 'GET') === method && url.replace(/^\/api/, '') === path,
  );
const sentBody = (call) => JSON.parse(call[1].body);

describe('saving to history from the final amount screen', () => {
  it('saves the invoice once when the final amount shows', async () => {
    const mock = await openResult();
    const status = screen.getByTestId('history-status');
    await waitFor(() => expect(status).toHaveTextContent('Saved to your history'));
    const posts = calls(mock, 'POST', '/history');
    expect(posts).toHaveLength(1);
    expect(sentBody(posts[0])).toEqual({
      debit: '1250.50',
      credit: '400.00',
      imageRef: PIC,
      method: 'ocr',
    });
    expect(posts[0][1].headers.Authorization).toBe('Bearer tok-123');
    expect(within(status).getByRole('link', { name: 'View history' })).toHaveAttribute(
      'href',
      '/history',
    );
    // The id is kept with the reading, so a reload does not save it again.
    expect(JSON.parse(sessionStorage.getItem(KEY)).historyId).toBe(HISTORY_ID);
  });

  it('a second invoice in the same session is a new record, not a correction of the first', async () => {
    const SECOND = 'b'.repeat(32);
    const ids = ['1'.repeat(32), '2'.repeat(32)];
    let made = 0;
    const mock = await openResult({
      handlers: {
        'POST /history': (body) => [201, entry({ ...body, id: ids[made++] })],
      },
    });
    await waitFor(() => expect(calls(mock, 'POST', '/history')).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByTestId('history-status')).toHaveTextContent('Saved to your history'),
    );

    await user.click(screen.getByRole('button', { name: 'Start a new invoice' }));
    await screen.findByRole('heading', { name: 'Upload your invoice' });
    invoiceApi.deleteInvoice.mockResolvedValue({ ok: true });
    invoiceApi.uploadInvoice.mockResolvedValue({
      id: SECOND,
      size: 10,
      mimeType: 'image/jpeg',
      createdAt: 'x',
    });
    await user.upload(
      screen.getByTestId('file-input'),
      new File(['x'], 'second.jpg', { type: 'image/jpeg' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Type the amounts instead' }));
    await user.type(screen.getByLabelText(/^Debit/), '75');
    await user.click(screen.getByRole('button', { name: 'Calculate final amount' }));
    await screen.findByRole('heading', { name: 'Final amount' });

    await waitFor(() => expect(calls(mock, 'POST', '/history')).toHaveLength(2));
    expect(sentBody(calls(mock, 'POST', '/history')[1])).toEqual({
      debit: '75',
      credit: '',
      imageRef: SECOND,
      method: 'manual',
    });
    await waitFor(() =>
      expect(screen.getByTestId('history-status')).toHaveTextContent('Saved to your history'),
    );
    // Nothing was ever sent as a correction of the first invoice's record.
    expect(calls(mock, 'PATCH', `/history/${ids[0]}`)).toHaveLength(0);
    expect(JSON.parse(sessionStorage.getItem(KEY)).historyId).toBe(ids[1]);
  });

  it('an invoice typed by hand is saved with no picture reference', async () => {
    const mock = await openResult({
      result: { provider: 'manual', debit: null, credit: null, warnings: [] },
      values: { debit: '75', credit: '' },
    });
    await waitFor(() => expect(calls(mock, 'POST', '/history')).toHaveLength(1));
    expect(sentBody(calls(mock, 'POST', '/history')[0])).toEqual({
      debit: '75',
      credit: '',
      method: 'manual',
    });
  });

  it('a correction updates the same record instead of saving a new one', async () => {
    const mock = await openResult();
    await waitFor(() => expect(calls(mock, 'POST', '/history')).toHaveLength(1));
    const credit = screen.getByLabelText(/^Credit/);
    await user.clear(credit);
    await user.type(credit, '1300');
    await waitFor(() => expect(calls(mock, 'PATCH', `/history/${HISTORY_ID}`)).toHaveLength(1), {
      timeout: 3000,
    });
    const patches = calls(mock, 'PATCH', `/history/${HISTORY_ID}`);
    expect(sentBody(patches[0])).toEqual({ debit: '1250.50', credit: '1300' }); // one request, not one per key
    expect(calls(mock, 'POST', '/history')).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getByTestId('history-status')).toHaveTextContent('Saved to your history'),
    );
  });

  it('sends nothing while the amounts are not a valid result', async () => {
    const mock = await openResult({
      result: reading({ debit: null, credit: null }),
      values: { debit: '', credit: '' },
    });
    await new Promise((r) => setTimeout(r, 700));
    expect(calls(mock, 'POST', '/history')).toHaveLength(0);
    expect(screen.getByTestId('history-status')).toBeEmptyDOMElement();
    // The first valid amount saves it.
    await user.type(screen.getByLabelText(/^Debit/), '5');
    await waitFor(() => expect(calls(mock, 'POST', '/history')).toHaveLength(1));
  });

  it('a reload of an already saved invoice does not save it again', async () => {
    const mock = await openResult({ historyId: HISTORY_ID });
    expect(screen.getByTestId('history-status')).toHaveTextContent('Saved to your history');
    await new Promise((r) => setTimeout(r, 700));
    expect(calls(mock, 'POST', '/history')).toHaveLength(0);
    expect(calls(mock, 'PATCH', `/history/${HISTORY_ID}`)).toHaveLength(0);
  });

  it('a failed save says so, keeps the screen working and offers Try again', async () => {
    let fail = true;
    const mock = await openResult({
      handlers: {
        'POST /history': () =>
          fail ? [500, { error: 'Something went wrong.' }] : [201, entry({ id: HISTORY_ID })],
      },
    });
    const status = screen.getByTestId('history-status');
    await waitFor(() => expect(status).toHaveTextContent('Could not save this invoice'));
    expect(screen.getByTestId('final')).toHaveTextContent('₹850.50'); // the result is still there
    fail = false;
    await user.click(within(status).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(status).toHaveTextContent('Saved to your history'));
    expect(calls(mock, 'POST', '/history')).toHaveLength(2);
  });

  it('an invoice that was removed from the history meanwhile is saved again after a correction', async () => {
    const mock = await openResult({
      historyId: HISTORY_ID,
      handlers: { [`PATCH /history/${HISTORY_ID}`]: [404, { error: 'Saved invoice not found.' }] },
    });
    await user.type(screen.getByLabelText(/^Debit/), '0');
    await waitFor(() => expect(calls(mock, 'POST', '/history')).toHaveLength(1), { timeout: 3000 });
    expect(sentBody(calls(mock, 'POST', '/history')[0]).debit).toBe('1250.500');
  });
});

describe('History page', () => {
  const page = (entries, total = entries.length) => [200, { entries, total, limit: 20, offset: 0 }];
  const lastList = (mock) => {
    const urls = mock.mock.calls.map(([u]) => u).filter((u) => u.startsWith('/api/history'));
    return new URL(urls.at(-1), 'http://x').searchParams;
  };

  async function openHistory(handlers) {
    storeSession();
    const mock = stubApi({ ...ME, ...handlers });
    renderApp('/history');
    await screen.findByRole('heading', { name: 'History' });
    return mock;
  }

  it('lists saved invoices newest first with the result, date and both amounts', async () => {
    await openHistory({
      'GET /history?limit=20&offset=0': page([
        entry(),
        entry({
          id: '1'.repeat(32),
          type: 'credit',
          debit: '300.00',
          credit: '12345678.50',
          net: '12345378.50',
        }),
        entry({ id: '2'.repeat(32), type: 'balanced', debit: '5.00', credit: '5.00', net: '0.00' }),
      ]),
    });
    const items = await screen.findAllByRole('link', { name: /₹/ });
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Net Debit');
    expect(items[0]).toHaveTextContent('₹850.00');
    expect(items[0]).toHaveTextContent('Debit ₹1,250.00 · Credit ₹400.00');
    expect(items[0]).toHaveAttribute('href', `/history/${'f'.repeat(32)}`);
    expect(items[1]).toHaveTextContent('Net Credit');
    expect(items[1]).toHaveTextContent('₹1,23,45,378.50'); // lakh grouping
    expect(items[2]).toHaveTextContent('Balanced');
    expect(screen.getByTestId('history-count')).toHaveTextContent('Showing 3 of 3 invoices');
  });

  it('says so when nothing is saved yet, and links back to a new invoice', async () => {
    await openHistory({ 'GET /history?limit=20&offset=0': page([]) });
    expect(await screen.findByTestId('history-empty')).toHaveTextContent('Nothing saved yet');
    expect(screen.getByRole('link', { name: 'New invoice' })).toHaveAttribute('href', '/');
  });

  it('searches by text after a short pause', async () => {
    const mock = await openHistory({
      'GET /history?limit=20&offset=0': page([entry()]),
      'GET /history?q=1250&limit=20&offset=0': page([entry()]),
    });
    await screen.findByRole('link', { name: /₹850/ });
    await user.type(screen.getByLabelText('Search'), '1250');
    await waitFor(() => expect(lastList(mock).get('q')).toBe('1250'));
    // One request for the whole word, not one per key.
    const withQuery = mock.mock.calls.filter(([u]) => u.includes('q='));
    expect(withQuery).toHaveLength(1);
  });

  it('filters by kind of result and by dates, sending the whole local days', async () => {
    const mock = await openHistory({
      'GET /history?limit=20&offset=0': page([entry()]),
      'GET /history?type=credit&limit=20&offset=0': page([]),
    });
    await screen.findByRole('link', { name: /₹850/ });
    await user.selectOptions(screen.getByLabelText('Show'), 'credit');
    await waitFor(() => expect(lastList(mock).get('type')).toBe('credit'));
    expect(await screen.findByTestId('history-empty')).toHaveTextContent('No saved invoices match');

    // Date boxes: typed straight in, the way a date input reports them.
    const dates = (await import('../src/history/dates.js')).dayStart('2026-11-18');
    const stub = stubApi({
      ...ME,
      [`GET /history?type=credit&from=${encodeURIComponent(dates)}&limit=20&offset=0`]: page([]),
    });
    const from = screen.getByLabelText('From');
    await user.click(from);
    await user.type(from, '2026-11-18');
    await waitFor(() => expect(lastList(stub).get('from')).toBe(dates));
  });

  it('warns when the From date is after the To date and does not search', async () => {
    const mock = await openHistory({ 'GET /history?limit=20&offset=0': page([entry()]) });
    await screen.findByRole('link', { name: /₹850/ });
    const before = mock.mock.calls.length;
    await user.type(screen.getByLabelText('From'), '2026-11-20');
    await user.type(screen.getByLabelText('To'), '2026-11-10');
    expect(await screen.findByRole('alert')).toHaveTextContent('From date is after the To date');
    await new Promise((r) => setTimeout(r, 500));
    expect(mock.mock.calls.slice(before).every(([u]) => !u.includes('to='))).toBe(true);
  });

  it('Clear search and filters starts again from everything', async () => {
    const mock = await openHistory({
      'GET /history?limit=20&offset=0': page([entry()]),
      'GET /history?type=credit&limit=20&offset=0': page([]),
    });
    await screen.findByRole('link', { name: /₹850/ });
    expect(screen.queryByRole('button', { name: /Clear search/ })).toBeNull();
    await user.selectOptions(screen.getByLabelText('Show'), 'credit');
    await screen.findByTestId('history-empty');
    await user.click(screen.getByRole('button', { name: 'Clear search and filters' }));
    expect(await screen.findByRole('link', { name: /₹850/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Show')).toHaveValue('');
    expect(lastList(mock).get('type')).toBeNull();
  });

  it('Show more adds the next page', async () => {
    const second = entry({ id: '3'.repeat(32), debit: '9.00', credit: '0.00', net: '9.00' });
    await openHistory({
      'GET /history?limit=20&offset=0': [
        200,
        { entries: [entry()], total: 2, limit: 20, offset: 0 },
      ],
      'GET /history?limit=20&offset=1': [
        200,
        { entries: [second], total: 2, limit: 20, offset: 1 },
      ],
    });
    await screen.findByRole('link', { name: /₹850/ });
    expect(screen.getByTestId('history-count')).toHaveTextContent('Showing 1 of 2 invoices');
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(await screen.findByRole('link', { name: /₹9\.00/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /₹/ })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('shows a failed load with Try again', async () => {
    let fail = true;
    await openHistory({
      'GET /history?limit=20&offset=0': () =>
        fail ? [500, { error: 'Something went wrong.' }] : page([entry()]),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: /₹850/ })).toBeInTheDocument();
  });

  it('is reachable from the home page header', async () => {
    storeSession();
    stubApi({ ...ME, 'GET /history?limit=20&offset=0': page([]) });
    renderApp('/');
    await user.click(await screen.findByRole('link', { name: 'History' }));
    expect(await screen.findByRole('heading', { name: 'History' })).toBeInTheDocument();
  });
});

describe('a saved invoice', () => {
  const id = 'f'.repeat(32);

  async function openEntry(handlers = {}) {
    storeSession();
    const mock = stubApi({ ...ME, ...handlers });
    renderApp(`/history/${id}`);
    return mock;
  }

  it('shows the final amount, the two amounts, when it was saved and how it was read', async () => {
    await openEntry({ [`GET /history/${id}`]: [200, entry()] });
    const heading = await screen.findByRole('heading', { name: 'Saved invoice' });
    expect(heading).toHaveFocus();
    expect(screen.getByTestId('final')).toHaveTextContent('Net Debit');
    expect(screen.getByTestId('final')).toHaveTextContent('₹850.00');
    expect(screen.getByTestId('final')).toHaveTextContent(
      'Debit ₹1,250.00 − Credit ₹400.00 = ₹850.00',
    );
    expect(screen.getByTestId('entry-saved')).toHaveAttribute(
      'datetime',
      '2026-11-19T12:30:00.000Z',
    );
    expect(screen.getByText('Local OCR')).toBeInTheDocument();
    expect(screen.getByText(/deleted after it was read/)).toHaveTextContent('aaaaaaaa');
    expect(screen.queryByText('Amounts last changed')).toBeNull();
  });

  it('an invoice typed by hand says there was no picture; a changed one shows when', async () => {
    await openEntry({
      [`GET /history/${id}`]: [
        200,
        entry({ imageRef: null, method: 'manual', updatedAt: '2026-11-20T08:00:00.000Z' }),
      ],
    });
    await screen.findByRole('heading', { name: 'Saved invoice' });
    expect(screen.getByText('Typed by hand')).toBeInTheDocument();
    expect(screen.getByText(/typed by hand\./)).toBeInTheDocument();
    expect(screen.getByText('Amounts last changed')).toBeInTheDocument();
  });

  it('an invoice typed by hand after a picture was uploaded says the picture was not read', async () => {
    await openEntry({ [`GET /history/${id}`]: [200, entry({ method: 'manual' })] });
    await screen.findByRole('heading', { name: 'Saved invoice' });
    expect(screen.getByText(/picture was deleted without being read/)).toBeInTheDocument();
  });

  it('shows every decimal of an exact amount and a note that the big figure is rounded', async () => {
    await openEntry({
      [`GET /history/${id}`]: [
        200,
        entry({ debit: '10.001', credit: '0.00', net: '10.001', netRounded: '10.00' }),
      ],
    });
    await screen.findByRole('heading', { name: 'Saved invoice' });
    expect(screen.getByTestId('final')).toHaveTextContent('₹10.00');
    expect(screen.getByTestId('final')).toHaveTextContent('The exact amount is ₹10.001');
  });

  it('copies the result', async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await openEntry({ [`GET /history/${id}`]: [200, entry()] });
    await screen.findByRole('heading', { name: 'Saved invoice' });
    await user.click(screen.getByRole('button', { name: 'Copy result' }));
    expect(writeText).toHaveBeenCalledWith('Net Debit ₹850.00 (Debit ₹1,250.00 − Credit ₹400.00)');
    expect(await screen.findByText('Copied to the clipboard.')).toBeInTheDocument();
  });

  it('deleting asks first, and Keep it changes nothing', async () => {
    const mock = await openEntry({ [`GET /history/${id}`]: [200, entry()] });
    await screen.findByRole('heading', { name: 'Saved invoice' });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('This cannot be undone');
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(calls(mock, 'DELETE', `/history/${id}`)).toHaveLength(0);
  });

  it('deleting goes back to the list', async () => {
    const mock = await openEntry({
      [`GET /history/${id}`]: [200, entry()],
      [`DELETE /history/${id}`]: [200, { ok: true }],
      'GET /history?limit=20&offset=0': [200, { entries: [], total: 0, limit: 20, offset: 0 }],
    });
    await screen.findByRole('heading', { name: 'Saved invoice' });
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    expect(await screen.findByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(calls(mock, 'DELETE', `/history/${id}`)).toHaveLength(1);
    expect(await screen.findByTestId('history-empty')).toBeInTheDocument();
  });

  it('an invoice that does not exist says so', async () => {
    await openEntry({ [`GET /history/${id}`]: [404, { error: 'Saved invoice not found.' }] });
    expect(await screen.findByRole('heading', { name: 'Invoice not found' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('does not exist any more');
    expect(screen.getByRole('link', { name: 'Back to history' })).toHaveAttribute(
      'href',
      '/history',
    );
  });

  it('any other failure shows the server’s message', async () => {
    await openEntry({ [`GET /history/${id}`]: [500, { error: 'Something went wrong.' }] });
    expect(
      await screen.findByRole('heading', { name: 'Could not open this invoice' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.');
  });
});
