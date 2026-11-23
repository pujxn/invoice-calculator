import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../src/api.js';
import * as invoiceApi from '../src/invoices/invoiceApi.js';
import * as historyApi from '../src/history/historyApi.js';
import { renderApp, storeSession, stubApi } from './helpers.jsx';

vi.mock('../src/invoices/invoiceApi.js', () => ({
  uploadInvoice: vi.fn(),
  getInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  fetchInvoiceImage: vi.fn(),
  extractInvoice: vi.fn(),
  getReadingMethods: vi.fn(),
}));

vi.mock('../src/history/historyApi.js', () => ({
  saveHistoryEntry: vi.fn(),
  updateHistoryEntry: vi.fn(),
  deleteHistoryEntry: vi.fn(),
}));

const KEY = 'invoice-calculator.batch';
const user = () => userEvent.setup({ applyAccept: false });
const photo = (name) => new File(['x'], name, { type: 'image/jpeg', lastModified: 1 });
const reading = (debit, credit, over = {}) => ({
  provider: 'ocr',
  model: null,
  imageDeleted: true,
  debit,
  credit,
  currency: 'INR',
  confidence: 'high',
  notes: '',
  warnings: [],
  ...over,
});

// A reader the test controls: each picture's reading waits until the test answers it.
let pending; // picture id -> { resolve, reject }
let started; // picture ids in the order their reading started
function fakeServer() {
  pending = new Map();
  started = [];
  invoiceApi.uploadInvoice.mockImplementation(async (file) => ({
    id: `id-${file.name}`,
    size: 1,
    mimeType: 'image/jpeg',
    createdAt: 'x',
  }));
  invoiceApi.extractInvoice.mockImplementation(
    (id, opts) =>
      new Promise((resolve, reject) => {
        started.push(id);
        pending.set(id, { resolve, reject });
        opts.signal.addEventListener('abort', () =>
          reject(new DOMException('cancelled', 'AbortError')),
        );
      }),
  );
}
const answer = (name, debit, credit, over) =>
  act(async () => pending.get(`id-${name}`).resolve(reading(debit, credit, over)));
const fail = (name, status = 422, message = 'We could not find an invoice in this picture.') =>
  act(async () => pending.get(`id-${name}`).reject(new ApiError(status, message, {})));

async function openBatch(names) {
  storeSession();
  stubApi({ 'GET /auth/me': [200, { phone: '+447700900123', expiresAt: 'x' }] });
  renderApp('/');
  if (names.length > 1) {
    fireEvent.change(await screen.findByTestId('file-input'), {
      target: { files: names.map(photo) },
    });
  } else {
    await user().click(await screen.findByRole('button', { name: 'Several invoices at once' }));
    fireEvent.change(await screen.findByTestId('batch-input'), {
      target: { files: names.map(photo) },
    });
  }
  await screen.findByRole('heading', { name: 'Several invoices at once' });
}
const row = (name) => screen.getByRole('listitem', { name: new RegExp(name) });
const total = () => screen.getByTestId('batch-final');

beforeEach(() => {
  vi.clearAllMocks();
  invoiceApi.deleteInvoice.mockResolvedValue({ ok: true });
  let n = 0;
  historyApi.saveHistoryEntry.mockImplementation(async () => ({ id: `h${(n += 1)}` }));
  historyApi.updateHistoryEntry.mockImplementation(async (id) => ({ id }));
  historyApi.deleteHistoryEntry.mockResolvedValue({ ok: true });
  fakeServer();
});

describe('batch upload', () => {
  it('reads several invoices and shows one combined total, with each invoice editable', async () => {
    await openBatch(['a.jpg', 'b.jpg', 'c.jpg']);
    await waitFor(() => expect(started).toHaveLength(3));
    await answer('a.jpg', '1250.00', '400.00');
    await answer('b.jpg', '300', '975.50');
    await answer('c.jpg', '720', null);

    await waitFor(() => expect(screen.getByText('All 3 finished.')).toBeInTheDocument());
    expect(within(total()).getByText('Net Debit')).toBeInTheDocument();
    expect(within(total()).getByText('₹894.50')).toBeInTheDocument();
    expect(screen.getByTestId('total-debit')).toHaveTextContent('₹2,270.00');
    expect(screen.getByTestId('total-credit')).toHaveTextContent('₹1,375.50');
    expect(screen.getByTestId('total-counted')).toHaveTextContent('Counting 3 of 3 invoices.');
    expect(within(row('b.jpg')).getByTestId('row-net')).toHaveTextContent(
      'This invoice: Net Credit ₹675.50',
    );

    // Fixing one invoice's amount moves the total at once.
    const box = within(row('c.jpg')).getByLabelText(/^Debit/);
    await user().clear(box);
    await user().type(box, '1,00,000');
    expect(within(total()).getByText('₹1,00,174.50')).toBeInTheDocument();
  });

  it('never has more than three pictures in flight, and starts the next as one finishes', async () => {
    const names = Array.from({ length: 8 }, (_, i) => `f${i}.jpg`);
    await openBatch(names);
    await waitFor(() => expect(started).toHaveLength(3));
    expect(started).toEqual(['id-f0.jpg', 'id-f1.jpg', 'id-f2.jpg']);
    expect(screen.getAllByText('Waiting')).toHaveLength(5);

    await answer('f0.jpg', '10', null);
    await waitFor(() => expect(started).toHaveLength(4));
    expect(started[3]).toBe('id-f3.jpg');
    await fail('f1.jpg');
    await waitFor(() => expect(started).toHaveLength(5));

    for (const name of ['f2.jpg', 'f3.jpg', 'f4.jpg', 'f5.jpg', 'f6.jpg', 'f7.jpg']) {
      await waitFor(() => expect(pending.has(`id-${name}`)).toBe(true));
      await answer(name, '10', null);
    }
    await waitFor(() => expect(screen.getByText('All 8 finished.')).toBeInTheDocument());
    expect(within(total()).getByText('₹70.00')).toBeInTheDocument(); // 7 read, 1 failed
  });

  it('a failed picture does not block the total, and can be retried, typed by hand or removed', async () => {
    await openBatch(['good.jpg', 'bad.jpg', 'meh.jpg']);
    await waitFor(() => expect(started).toHaveLength(3));
    await answer('good.jpg', '500', '100');
    await fail('bad.jpg', 422, 'We could not find an invoice in this picture.');
    await answer('meh.jpg', null, '50');

    await waitFor(() => expect(screen.getByText('All 3 finished.')).toBeInTheDocument());
    expect(within(total()).getByText('₹350.00')).toBeInTheDocument();
    expect(screen.getByTestId('total-counted')).toHaveTextContent(
      'Counting 2 of 3 invoices. Not counted: 1 failed.',
    );
    const bad = row('bad.jpg');
    expect(within(bad).getByRole('alert')).toHaveTextContent('We could not find an invoice');

    // Retry sends the same picture to be read again (no second upload) and it can succeed.
    await user().click(within(bad).getByRole('button', { name: /^Retry/ }));
    await waitFor(() => expect(started.filter((s) => s === 'id-bad.jpg')).toHaveLength(2));
    expect(invoiceApi.uploadInvoice).toHaveBeenCalledTimes(3);
    await answer('bad.jpg', '1000', null);
    await waitFor(() => expect(within(total()).getByText('₹1,350.00')).toBeInTheDocument());
  });

  it('lets a failed picture be typed by hand, and removed', async () => {
    await openBatch(['one.jpg', 'two.jpg']);
    await waitFor(() => expect(started).toHaveLength(2));
    await answer('one.jpg', '100', null);
    await fail('two.jpg');
    const two = row('two.jpg');
    await user().click(within(two).getByRole('button', { name: /^Type the amounts/ }));
    expect(invoiceApi.deleteInvoice).toHaveBeenCalledWith('id-two.jpg', 'tok-123');
    await user().type(within(row('two.jpg')).getByLabelText(/^Credit/), '30');
    expect(within(total()).getByText('₹70.00')).toBeInTheDocument();

    await user().click(within(row('one.jpg')).getByRole('button', { name: /^Remove/ }));
    expect(screen.queryByRole('listitem', { name: /one.jpg/ })).toBeNull();
    expect(within(total()).getByText('Net Credit')).toBeInTheDocument();
    expect(within(total()).getByText('₹30.00')).toBeInTheDocument();
  });

  it('shows a busy answer that gives no wait time as a failure', async () => {
    await openBatch(['busy.jpg']);
    await waitFor(() => expect(started).toHaveLength(1));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await fail('busy.jpg', 429, 'Reading is busy right now.');
    // fail() rejected with no retryAfterSeconds -> shown, not retried silently
    await waitFor(() => expect(screen.getByText('All 1 finished.')).toBeInTheDocument());
    expect(within(row('busy.jpg')).getByRole('alert')).toHaveTextContent('busy right now');
    vi.useRealTimers();
  });

  it('retries a "busy" answer by itself', async () => {
    await openBatch(['busy.jpg']);
    await waitFor(() => expect(started).toHaveLength(1));
    await act(async () =>
      pending
        .get('id-busy.jpg')
        .reject(new ApiError(429, 'Reading is busy right now.', { retryAfterSeconds: 1 })),
    );
    await waitFor(() => expect(started).toHaveLength(2), { timeout: 3000 });
    await answer('busy.jpg', '5', null);
    await waitFor(() => expect(within(total()).getByText('₹5.00')).toBeInTheDocument());
  });

  it('flags an invoice that needs a look, and one whose amount is not valid, and still totals', async () => {
    await openBatch(['a.jpg', 'b.jpg']);
    await waitFor(() => expect(started).toHaveLength(2));
    await answer('a.jpg', '200', null, {
      confidence: 'low',
      warnings: [{ code: 'x', message: 'The Debit looked smudged.' }],
    });
    await answer('b.jpg', '50', null);
    expect(within(row('a.jpg')).getByText(/The Debit looked smudged/)).toBeInTheDocument();
    expect(within(row('b.jpg')).queryByText(/Please check/)).toBeNull();

    const box = within(row('b.jpg')).getByLabelText(/^Debit/);
    await user().clear(box);
    await user().type(box, '£5');
    expect(within(row('b.jpg')).getByRole('alert')).toBeInTheDocument();
    expect(within(row('b.jpg')).getByTestId('row-net')).toHaveTextContent('Not counted');
    expect(within(total()).getByText('₹200.00')).toBeInTheDocument();
    expect(screen.getByTestId('total-counted')).toHaveTextContent('1 with no usable amount');
  });

  it("shows each amount's High or Low confidence flag, which goes when the amount is changed", async () => {
    await openBatch(['a.jpg']);
    await waitFor(() => expect(started).toHaveLength(1));
    await answer('a.jpg', '200', '50', { amountConfidence: { debit: 'low', credit: 'high' } });
    const a = row('a.jpg');
    expect(within(a).getByTestId('debit-flag')).toHaveTextContent('Low confidence');
    expect(within(a).getByTestId('credit-flag')).toHaveTextContent('High confidence');
    expect(within(a).getByText(/Please check/)).toBeInTheDocument();
    await user().type(within(a).getByLabelText(/^Debit/), '0');
    expect(within(a).queryByTestId('debit-flag')).toBeNull();
    expect(within(a).queryByText(/Please check/)).toBeNull();
  });

  it('refuses a file that is not a picture, skips repeats, and shows which', async () => {
    await openBatch(['a.jpg']);
    const input = screen.getByTestId('batch-input');
    fireEvent.change(input, {
      target: {
        files: [photo('a.jpg'), new File(['x'], 'notes.pdf', { type: 'application/pdf' })],
      },
    });
    expect(await screen.findByText(/1 file was already in the list/)).toBeInTheDocument();
    const pdf = row('notes.pdf');
    expect(within(pdf).getByRole('alert')).toHaveTextContent('not a JPEG, PNG, WebP or HEIC');
    expect(within(pdf).queryByRole('button', { name: /Retry/ })).toBeNull();
    expect(invoiceApi.uploadInvoice).toHaveBeenCalledTimes(1);
  });

  it('keeps the batch across a reload, offering a retry for one that was being read', async () => {
    await openBatch(['a.jpg', 'b.jpg']);
    await waitFor(() => expect(started).toHaveLength(2));
    await answer('a.jpg', '100', '30');
    expect(JSON.parse(sessionStorage.getItem(KEY)).items).toHaveLength(2);

    cleanup();
    fakeServer();
    renderApp('/');
    expect(
      await screen.findByRole('heading', { name: 'Several invoices at once' }),
    ).toBeInTheDocument();
    expect(within(total()).getByText('₹70.00')).toBeInTheDocument();
    const b = row('b.jpg');
    expect(within(b).getByRole('alert')).toHaveTextContent('stopped when the page was reloaded');
    await user().click(within(b).getByRole('button', { name: /^Retry/ }));
    await waitFor(() => expect(started).toContain('id-b.jpg'));
    expect(invoiceApi.uploadInvoice).toHaveBeenCalledTimes(2); // not uploaded again
  });

  it('Clear all removes everything and deletes the pictures still on the server', async () => {
    await openBatch(['a.jpg', 'b.jpg']);
    await waitFor(() => expect(started).toHaveLength(2));
    await user().click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.queryByRole('list')).toBeNull();
    expect(invoiceApi.deleteInvoice).toHaveBeenCalledWith('id-a.jpg', 'tok-123');
    expect(invoiceApi.deleteInvoice).toHaveBeenCalledWith('id-b.jpg', 'tok-123');
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('goes back to the one-invoice screen and returns to the same batch', async () => {
    await openBatch(['a.jpg']);
    await waitFor(() => expect(started).toHaveLength(1));
    await answer('a.jpg', '10', null);
    await user().click(screen.getByRole('button', { name: 'Back to one invoice' }));
    await screen.findByRole('heading', { name: 'Upload your invoice' });
    await user().click(screen.getByRole('button', { name: 'Several invoices at once' }));
    expect(await screen.findByRole('listitem', { name: /a.jpg/ })).toBeInTheDocument();
    expect(within(total()).getByText('₹10.00')).toBeInTheDocument();
  });

  it('signing out ends the session when the server says 401', async () => {
    invoiceApi.uploadInvoice.mockRejectedValue(new ApiError(401, 'Please sign in again.', {}));
    await openBatch(['a.jpg']);
    await screen
      .findByRole('heading', { name: /Sign in|Welcome back|Mobile number/i })
      .catch(() => {});
    await waitFor(() => expect(localStorage.getItem('invoice-calculator.session')).toBeNull());
  });

  describe('saving to the history', () => {
    it('saves each finished invoice once, and a correction updates the same record', async () => {
      await openBatch(['a.jpg', 'b.jpg']);
      await waitFor(() => expect(started).toHaveLength(2));
      await answer('a.jpg', '100', '30');
      await answer('b.jpg', '5', null);
      await waitFor(() => expect(historyApi.saveHistoryEntry).toHaveBeenCalledTimes(2));
      expect(historyApi.saveHistoryEntry).toHaveBeenCalledWith(
        { debit: '100', credit: '30', imageRef: 'id-a.jpg', method: 'ocr' },
        'tok-123',
      );
      expect(await screen.findByText(/Saved to your history/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'View history' })).toHaveAttribute(
        'href',
        '/history',
      );

      const box = within(row('a.jpg')).getByLabelText(/^Debit/);
      await user().clear(box);
      await user().type(box, '250');
      await waitFor(() =>
        expect(historyApi.updateHistoryEntry).toHaveBeenLastCalledWith(
          'h1',
          { debit: '250', credit: '30' },
          'tok-123',
        ),
      );
      expect(historyApi.saveHistoryEntry).toHaveBeenCalledTimes(2); // still no third record
    });

    it('does not save an invoice with no usable amount, and saves it once it has one', async () => {
      await openBatch(['a.jpg']);
      await waitFor(() => expect(started).toHaveLength(1));
      await answer('a.jpg', null, null);
      await waitFor(() => expect(screen.getByText('All 1 finished.')).toBeInTheDocument());
      expect(historyApi.saveHistoryEntry).not.toHaveBeenCalled();
      await user().type(within(row('a.jpg')).getByLabelText(/^Credit/), '40');
      await waitFor(() => expect(historyApi.saveHistoryEntry).toHaveBeenCalledTimes(1));
    });

    it('says when saving failed, and Try again saves it', async () => {
      historyApi.saveHistoryEntry.mockRejectedValueOnce(new ApiError(500, 'Boom', {}));
      await openBatch(['a.jpg']);
      await waitFor(() => expect(started).toHaveLength(1));
      await answer('a.jpg', '10', null);
      expect(
        await screen.findByText(/Could not save 1 invoice to your history/),
      ).toBeInTheDocument();
      expect(historyApi.saveHistoryEntry).toHaveBeenCalledTimes(1); // no retry loop
      await user().click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(historyApi.saveHistoryEntry).toHaveBeenCalledTimes(2));
      expect(await screen.findByText(/Saved to your history/)).toBeInTheDocument();
    });

    it('Remove takes the invoice out of the history too; Clear all leaves the history alone', async () => {
      await openBatch(['a.jpg', 'b.jpg']);
      await waitFor(() => expect(started).toHaveLength(2));
      await answer('a.jpg', '10', null);
      await answer('b.jpg', '20', null);
      await waitFor(() => expect(historyApi.saveHistoryEntry).toHaveBeenCalledTimes(2));
      await screen.findByText(/Saved to your history/);
      await user().click(within(row('a.jpg')).getByRole('button', { name: /^Remove/ }));
      expect(historyApi.deleteHistoryEntry).toHaveBeenCalledWith('h1', 'tok-123');
      await user().click(screen.getByRole('button', { name: 'Clear all' }));
      expect(historyApi.deleteHistoryEntry).toHaveBeenCalledTimes(1);
    });
  });
});
