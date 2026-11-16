import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../src/api.js';
import * as invoiceApi from '../src/invoices/invoiceApi.js';
import { renderApp, storeSession, stubApi } from './helpers.jsx';

vi.mock('../src/invoices/invoiceApi.js', () => ({
  uploadInvoice: vi.fn(),
  getInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  fetchInvoiceImage: vi.fn(),
  extractInvoice: vi.fn(),
}));

const ID = 'a'.repeat(32);
const reading = (over = {}) => ({
  invoiceId: ID,
  provider: 'claude',
  model: 'claude-test',
  imageDeleted: true,
  debit: '1250.50',
  credit: '400.00',
  currency: 'INR',
  confidence: 'high',
  notes: '',
  warnings: [],
  lineItems: [],
  itemTotals: null,
  ...over,
});
const withItems = {
  lineItems: [
    { description: 'Parts', column: 'debit', amount: '1000.50' },
    { description: 'Labour', column: 'debit', amount: '250.00' },
    { description: 'Deposit', column: 'credit', amount: '400.00' },
  ],
  itemTotals: { debit: '1250.50', credit: '400.00' },
};

const user = () => userEvent.setup({ applyAccept: false });
const photo = () => new File(['x'], 'march.jpg', { type: 'image/jpeg' });
const debit = () => screen.getByLabelText(/^Debit/);
const credit = () => screen.getByLabelText(/^Credit/);

async function uploadAPicture() {
  storeSession();
  stubApi({ 'GET /auth/me': [200, { phone: '+447700900123', expiresAt: 'x' }] });
  invoiceApi.uploadInvoice.mockResolvedValue({
    id: ID,
    size: 1234,
    mimeType: 'image/jpeg',
    createdAt: 'x',
  });
  renderApp('/');
  await user().upload(await screen.findByTestId('file-input'), photo());
  await screen.findByText('Picture uploaded.');
}

// A reading the test finishes by hand, so the loading screen can be inspected.
function deferredRead() {
  const d = {};
  invoiceApi.extractInvoice.mockImplementationOnce(
    (id, opts) =>
      new Promise((resolve, reject) => {
        d.opts = opts;
        d.resolve = resolve;
        d.reject = reject;
        opts.signal.addEventListener('abort', () =>
          reject(new DOMException('cancelled', 'AbortError')),
        );
      }),
  );
  return d;
}

async function readIt(result = reading()) {
  invoiceApi.extractInvoice.mockResolvedValueOnce(result);
  await user().click(screen.getByRole('button', { name: 'Read amounts' }));
  await screen.findByRole('heading', { name: 'Amounts we found' });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  invoiceApi.deleteInvoice.mockResolvedValue({ ok: true });
});

describe('reading the amounts', () => {
  it('offers Read amounts next to Replace and Remove once a picture is uploaded', async () => {
    await uploadAPicture();
    expect(screen.getByRole('button', { name: 'Read amounts' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Replace picture' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('shows a loading state while reading, with Cancel, and nothing else to click', async () => {
    await uploadAPicture();
    const read = deferredRead();
    await user().click(screen.getByRole('button', { name: 'Read amounts' }));

    expect(await screen.findByText(/Reading your invoice/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Reading your invoice');
    expect(screen.getByAltText('Preview of march.jpg')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Read amounts' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Replace picture' })).toBeNull();
    expect(invoiceApi.extractInvoice).toHaveBeenCalledWith(ID, {
      token: 'tok-123',
      signal: expect.any(AbortSignal),
    });

    await act(async () => read.resolve(reading()));
    expect(await screen.findByRole('heading', { name: 'Amounts we found' })).toBeInTheDocument();
  });

  it('Cancel stops the reading and keeps the picture', async () => {
    await uploadAPicture();
    const read = deferredRead();
    await user().click(screen.getByRole('button', { name: 'Read amounts' }));
    await user().click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(read.opts.signal.aborted).toBe(true);
    expect(await screen.findByRole('button', { name: 'Read amounts' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(invoiceApi.deleteInvoice).not.toHaveBeenCalled();
  });

  it('shows the detected Debit and Credit, confidence and rupees, and drops the picture', async () => {
    await uploadAPicture();
    await readIt(reading({ notes: 'Slightly blurred.' }));
    expect(debit()).toHaveValue('1250.50');
    expect(credit()).toHaveValue('400.00');
    expect(screen.getByText(/Confidence:/)).toHaveTextContent(
      'Confidence: High · Amounts in rupees (₹)',
    );
    expect(screen.getByText('Slightly blurred.')).toBeInTheDocument();
    expect(screen.getByText(/Read from your picture by AI/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    // The server deleted the picture, so the screen lets go of it too.
    expect(screen.queryByAltText('Preview of march.jpg')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock/1');
  });

  it('says plainly when the values come from the demo (mock) reader', async () => {
    await uploadAPicture();
    await readIt(reading({ provider: 'mock' }));
    expect(screen.getByText(/Demo values \(no AI key is set\)/)).toBeInTheDocument();
  });

  it('lists the lines found, with totals under the right column', async () => {
    await uploadAPicture();
    await readIt(reading(withItems));
    const table = screen.getByRole('table', { name: 'Lines found on the invoice' });
    const rows = within(table).getAllByRole('row');
    expect(rows.map((r) => r.textContent)).toEqual([
      'DescriptionDebitCredit',
      'Parts1000.50',
      'Labour250.00',
      'Deposit400.00',
      'Lines add up to1250.50400.00',
    ]);
    expect(
      within(rows[1])
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['1000.50', '']);
    expect(
      within(rows[3])
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['', '400.00']);
  });

  it('shows warnings to check, and a missing amount as a blank box', async () => {
    await uploadAPicture();
    await readIt(
      reading({
        debit: null,
        confidence: 'low',
        warnings: [
          { field: 'debit', code: 'ambiguous', message: '"1,234" could mean 1,234 or 1.234.' },
          { field: 'general', code: 'x', message: 'Second warning.' },
        ],
      }),
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Please check:');
    expect(within(alert).getAllByRole('listitem')).toHaveLength(2);
    expect(alert).toHaveTextContent('could mean 1,234 or 1.234');
    expect(debit()).toHaveValue('');
    expect(
      screen.getByText('No Debit amount found. Leave blank if the invoice has none.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Confidence:/)).toHaveTextContent('Low');
    expect(credit()).toHaveValue('400.00');
  });
});

describe('typing the amounts by hand', () => {
  it('is always offered next to Read amounts, and skips the AI', async () => {
    await uploadAPicture();
    await user().click(screen.getByRole('button', { name: 'Type the amounts instead' }));
    expect(await screen.findByRole('heading', { name: 'Enter the amounts' })).toBeInTheDocument();
    expect(invoiceApi.extractInvoice).not.toHaveBeenCalled();
    // The picture is not needed any more, so it is deleted.
    expect(invoiceApi.deleteInvoice).toHaveBeenCalledWith(ID, 'tok-123');
    expect(debit()).toHaveValue('');
    expect(credit()).toHaveValue('');
    expect(screen.queryByText(/Confidence/)).toBeNull();
    expect(screen.queryByText(/No Debit amount found/)).toBeNull();
    await user().type(debit(), '75.5');
    expect(debit()).toHaveValue('75.5');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('works after reading failed', async () => {
    await uploadAPicture();
    invoiceApi.extractInvoice.mockRejectedValueOnce(
      new ApiError(502, 'The AI service had a problem.', {}),
    );
    await user().click(screen.getByRole('button', { name: 'Read amounts' }));
    await screen.findByRole('alert');
    await user().click(screen.getByRole('button', { name: 'Type the amounts instead' }));
    expect(await screen.findByRole('heading', { name: 'Enter the amounts' })).toBeInTheDocument();
    expect(screen.queryByText('The AI service had a problem.')).toBeNull();
  });
});

describe('when reading fails', () => {
  async function failWith(error) {
    await uploadAPicture();
    invoiceApi.extractInvoice.mockRejectedValueOnce(error);
    await user().click(screen.getByRole('button', { name: 'Read amounts' }));
  }

  it('shows the message, keeps the picture and lets the user try again', async () => {
    await failWith(new ApiError(504, 'Reading the invoice took too long. Please try again.', {}));
    expect(await screen.findByRole('alert')).toHaveTextContent('took too long');
    expect(screen.getByAltText('Preview of march.jpg')).toBeInTheDocument();
    await readIt();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(invoiceApi.extractInvoice).toHaveBeenCalledTimes(2);
  });

  it.each([
    [422, 'We could not find an invoice in this picture.'],
    [502, 'The AI gave an answer we could not use. Try again.'],
    [409, 'This picture is already being read.'],
    [0, 'Cannot reach the server. Check your connection and try again.'],
  ])('shows the server message for %s', async (status, message) => {
    await failWith(new ApiError(status, message, {}));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Read amounts' })).toBeEnabled();
  });

  it('says when to try again after a rate limit', async () => {
    await failWith(
      new ApiError(429, 'The AI service is busy right now.', { retryAfterSeconds: 17 }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The AI service is busy right now. Try again in 17 seconds.',
    );
  });

  it('turns long waits into minutes', async () => {
    await failWith(new ApiError(429, 'Too many.', { retryAfterSeconds: 1800 }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in 30 minutes.');
  });

  it('asks for a new upload if the picture has gone from the server', async () => {
    await failWith(new ApiError(404, 'Invoice picture not found.', {}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please upload it again');
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeInTheDocument();
  });

  it('signs the user out if the session ended', async () => {
    await failWith(new ApiError(401, 'Not signed in.', {}));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'));
  });

  it('uses a generic message for an unexpected error', async () => {
    await failWith(new Error('boom'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Reading the picture failed. Please try again.',
    );
  });
});

describe('editing the amounts', () => {
  it('lets the user change both values and reset them', async () => {
    await uploadAPicture();
    await readIt();
    expect(screen.queryByRole('button', { name: 'Reset to what was found' })).toBeNull();

    await user().clear(debit());
    await user().type(debit(), '1300');
    await user().clear(credit());
    expect(debit()).toHaveValue('1300');
    expect(credit()).toHaveValue('');
    expect(screen.getByText('Blank counts as none.')).toBeInTheDocument();

    await user().click(screen.getByRole('button', { name: 'Reset to what was found' }));
    expect(debit()).toHaveValue('1250.50');
    expect(credit()).toHaveValue('400.00');
    expect(screen.queryByRole('button', { name: 'Reset to what was found' })).toBeNull();
  });

  it('flags a bad entry next to the box, not with a popup', async () => {
    await uploadAPicture();
    await readIt();
    await user().clear(debit());
    await user().type(debit(), '1.0000000000001');
    expect(debit()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Use at most 12 decimal places.')).toHaveAttribute('role', 'alert');
    expect(credit()).toHaveAttribute('aria-invalid', 'false');

    // any other amount is fine, however many decimals it has
    await user().clear(debit());
    await user().type(debit(), '12.345');
    expect(debit()).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByText('Use at most 12 decimal places.')).toBeNull();

    await user().clear(debit());
    await user().type(debit(), '-5');
    expect(screen.getByText('Amounts cannot be negative.')).toBeInTheDocument();
    await user().clear(debit());
    await user().type(debit(), 'abc');
    expect(screen.getByText(/^Enter a number such as 1250\.50/)).toBeInTheDocument();
    await user().clear(debit());
    await user().type(debit(), '1,300.5');
    expect(debit()).toHaveAttribute('aria-invalid', 'false');
  });

  it('each box is described by its own hint', async () => {
    await uploadAPicture();
    await readIt();
    expect(debit()).toHaveAccessibleDescription('');
    await user().type(debit(), 'x');
    expect(debit()).toHaveAccessibleDescription(/number such as/);
    expect(debit()).toHaveAttribute('inputmode', 'decimal');
  });
});

describe('keeping and leaving the reading', () => {
  it('keeps the edited values across a reload of this tab', async () => {
    await uploadAPicture();
    await readIt(reading(withItems));
    await user().clear(debit());
    await user().type(debit(), '999.99');
    document.body.innerHTML = '';

    stubApi({ 'GET /auth/me': [200, { phone: '+447700900123', expiresAt: 'x' }] });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Amounts we found' })).toBeInTheDocument();
    expect(debit()).toHaveValue('999.99');
    expect(credit()).toHaveValue('400.00');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset to what was found' })).toBeInTheDocument();
  });

  it("does not show one number's reading to another", async () => {
    sessionStorage.setItem(
      'invoice-calculator.extracted',
      JSON.stringify({
        phone: '+447700900999',
        result: reading(),
        values: { debit: '1', credit: '2' },
      }),
    );
    storeSession();
    stubApi({ 'GET /auth/me': [200, { phone: '+447700900123', expiresAt: 'x' }] });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Upload your invoice' })).toBeInTheDocument();
  });

  it('ignores a damaged saved reading', async () => {
    sessionStorage.setItem('invoice-calculator.extracted', '{not json');
    storeSession();
    stubApi({ 'GET /auth/me': [200, { phone: '+447700900123', expiresAt: 'x' }] });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Upload your invoice' })).toBeInTheDocument();
  });

  it('"Upload a different invoice" goes back to the start and forgets the reading', async () => {
    await uploadAPicture();
    await readIt();
    await user().click(screen.getByRole('button', { name: 'Upload a different invoice' }));
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeInTheDocument();
    expect(sessionStorage.getItem('invoice-calculator.extracted')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Amounts we found' })).toBeNull();
  });
});
