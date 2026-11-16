import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, storeSession, stubApi } from './helpers.jsx';

vi.mock('../src/invoices/invoiceApi.js', () => ({
  uploadInvoice: vi.fn(),
  getInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  fetchInvoiceImage: vi.fn(),
  extractInvoice: vi.fn(),
}));

const KEY = 'invoice-calculator.extracted';
const reading = (over = {}) => ({
  invoiceId: 'a'.repeat(32),
  provider: 'claude',
  model: 'claude-test',
  imageDeleted: true,
  debit: '1250.50',
  credit: '400.00',
  currency: 'GBP',
  confidence: 'high',
  notes: '',
  warnings: [],
  lineItems: [],
  itemTotals: null,
  ...over,
});

let user;

// Opens the app already on the review screen (or the result screen) with a reading.
async function open({ result = reading(), values, stage = 'review' } = {}) {
  sessionStorage.setItem(
    KEY,
    JSON.stringify({
      phone: '+447700900123',
      stage,
      result,
      values: values ?? { debit: result.debit ?? '', credit: result.credit ?? '' },
    }),
  );
  storeSession();
  stubApi({ 'GET /auth/me': [200, { phone: '+447700900123', expiresAt: 'x' }] });
  renderApp('/');
  await screen.findByRole('heading', {
    name: stage === 'result' ? 'Final amount' : /Amounts|Enter/,
  });
}

const final = () => screen.getByTestId('final');
const debit = () => screen.getByLabelText(/^Debit/);
const credit = () => screen.getByLabelText(/^Credit/);
const type = async (box, text) => {
  await user.clear(box);
  if (text) await user.type(box, text);
};
const calculate = () => user.click(screen.getByRole('button', { name: 'Calculate final amount' }));

beforeEach(() => {
  sessionStorage.clear();
  user = userEvent.setup({ applyAccept: false });
});

describe('Calculate final amount', () => {
  it('goes from the review screen to the result', async () => {
    await open();
    expect(screen.queryByRole('heading', { name: 'Final amount' })).toBeNull();
    await calculate();
    expect(await screen.findByRole('heading', { name: 'Final amount' })).toHaveFocus();
    expect(final()).toHaveTextContent('Net Debit');
    expect(final()).toHaveTextContent('£850.50');
    expect(final()).toHaveTextContent('Debit £1,250.50 − Credit £400.00 = £850.50');
  });

  it('asks for an amount instead of calculating when both boxes are blank', async () => {
    await open({ values: { debit: '', credit: '' } });
    await calculate();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter at least one amount');
    expect(screen.queryByRole('heading', { name: 'Final amount' })).toBeNull();
    await type(debit(), '5'); // the message goes away once the user changes something
    expect(screen.queryByText(/Enter at least one amount/)).toBeNull();
  });

  it('does not calculate while an amount is invalid', async () => {
    await open({ values: { debit: '12.345', credit: '1' } });
    await calculate();
    expect(
      screen
        .getAllByRole('alert')
        .map((a) => a.textContent)
        .join(' '),
    ).toMatch(/at most 2 decimal places/);
    expect(screen.queryByRole('heading', { name: 'Final amount' })).toBeNull();
  });
});

describe('the result screen', () => {
  it.each([
    ['1250.50', '400.00', 'Net Debit', '£850.50'],
    ['300.00', '975.50', 'Net Credit', '£675.50'],
    ['500.00', '500.00', 'Balanced', '£0.00'],
    ['720.00', '', 'Net Debit', '£720.00'],
    ['', '99.99', 'Net Credit', '£99.99'],
    ['0', '0', 'Balanced', '£0.00'],
    ['999999999999.99', '0.01', 'Net Debit', '£999,999,999,999.98'],
  ])('Debit %j and Credit %j give %s %s', async (d, c, label, amount) => {
    await open({ stage: 'result', values: { debit: d, credit: c } });
    expect(final()).toHaveTextContent(label);
    expect(final()).toHaveTextContent(amount);
  });

  it('shows the breakdown of the inputs', async () => {
    await open({ stage: 'result' });
    const table = screen.getByRole('table', { name: 'How it was worked out' });
    expect(within(table).getByRole('row', { name: /Debit £1,250.50/ })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Minus Credit £400.00/ })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /Net Debit £850.50/ })).toBeInTheDocument();
  });

  it('updates as the amounts are edited, and again as they are cleared', async () => {
    await open({ stage: 'result' });
    await type(credit(), '2000');
    expect(final()).toHaveTextContent('Net Credit');
    expect(final()).toHaveTextContent('£749.50');
    expect(final()).toHaveTextContent('= −£749.50');
    await type(credit(), '1,250.50');
    expect(final()).toHaveTextContent('Balanced');
    await type(credit(), '');
    expect(final()).toHaveTextContent('Net Debit');
    expect(final()).toHaveTextContent('£1,250.50');
  });

  it('is exact where floating point is not', async () => {
    await open({ stage: 'result', values: { debit: '0.30', credit: '0.10' } });
    expect(final()).toHaveTextContent('£0.20');
    expect(final()).not.toHaveTextContent('0.19999');
  });

  it('keeps a message instead of a figure while an amount is wrong or missing', async () => {
    await open({ stage: 'result' });
    await type(debit(), '-5');
    expect(final()).toHaveTextContent('No final amount yet');
    expect(final()).toHaveTextContent('Debit: Amounts cannot be negative');
    expect(screen.queryByRole('table', { name: 'How it was worked out' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Copy result' })).toBeDisabled();

    await type(debit(), '');
    await type(credit(), '');
    expect(final()).toHaveTextContent('Enter at least one amount');
    await type(credit(), '12.345');
    expect(final()).toHaveTextContent('Use at most 2 decimal places');
    await type(credit(), '7');
    expect(final()).toHaveTextContent('Net Credit');
  });

  it('uses the currency of the invoice, and plain numbers when there is none', async () => {
    await open({ stage: 'result', result: reading({ currency: 'USD' }) });
    expect(final()).toHaveTextContent('$850.50');
  });

  it('shows plain numbers when no currency was found', async () => {
    await open({ stage: 'result', result: reading({ currency: null }) });
    expect(final()).toHaveTextContent('850.50');
    expect(final()).not.toHaveTextContent(/[£$€]/);
  });

  it('groups rupees the Indian way', async () => {
    await open({
      stage: 'result',
      result: reading({ currency: 'INR', debit: '1234567.00', credit: '0.00' }),
    });
    expect(final()).toHaveTextContent('₹12,34,567.00');
  });

  it('works for amounts typed by hand', async () => {
    await open({
      stage: 'result',
      result: reading({ provider: 'manual', debit: null, credit: null, currency: null }),
      values: { debit: '10', credit: '3.5' },
    });
    expect(final()).toHaveTextContent('Net Debit');
    expect(final()).toHaveTextContent('6.50');
  });

  it('Reset puts back what was read, and only shows once something changed', async () => {
    await open({ stage: 'result' });
    expect(screen.queryByRole('button', { name: 'Reset to what was found' })).toBeNull();
    await type(debit(), '1');
    await user.click(screen.getByRole('button', { name: 'Reset to what was found' }));
    expect(debit()).toHaveValue('1250.50');
    expect(final()).toHaveTextContent('£850.50');
  });

  it('remembers the screen and the edits across a reload', async () => {
    await open({ stage: 'result', values: { debit: '10', credit: '4' } });
    expect(JSON.parse(sessionStorage.getItem(KEY)).stage).toBe('result');
  });

  it('an old saved reading without a stage opens on the review screen', async () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        phone: '+447700900123',
        result: reading(),
        values: { debit: '1', credit: '2' },
      }),
    );
    storeSession();
    stubApi({ 'GET /auth/me': [200, { phone: '+447700900123', expiresAt: 'x' }] });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Amounts we found' })).toBeInTheDocument();
  });
});

describe('moving on from the result', () => {
  it('Back to the invoice keeps the edits', async () => {
    await open({ stage: 'result' });
    await type(credit(), '50');
    await user.click(screen.getByRole('button', { name: 'Back to the invoice' }));
    expect(await screen.findByRole('heading', { name: 'Amounts we found' })).toHaveFocus();
    expect(screen.getByLabelText(/^Credit/)).toHaveValue('50');
    await calculate();
    expect(final()).toHaveTextContent('£1,200.50');
  });

  it('Start a new invoice goes to the upload screen without signing in again', async () => {
    await open({ stage: 'result' });
    await user.click(screen.getByRole('button', { name: 'Start a new invoice' }));
    expect(await screen.findByRole('heading', { name: 'Upload your invoice' })).toBeInTheDocument();
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});

describe('Copy result', () => {
  it('copies one line with the label, the amount and the working', async () => {
    const writeText = vi.fn().mockResolvedValue();
    await open({ stage: 'result' });
    // userEvent.setup replaces navigator.clipboard, so stub it after setup.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Copy result' }));
    expect(writeText).toHaveBeenCalledWith('Net Debit £850.50 (Debit £1,250.50 − Credit £400.00)');
    expect(screen.getByRole('status')).toHaveTextContent('Copied to the clipboard.');
  });

  it('says so when the browser refuses, and forgets the message after an edit', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    await open({ stage: 'result' });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Copy result' }));
    expect(screen.getByRole('status')).toHaveTextContent('would not let us copy');
    await type(debit(), '1');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('says so when there is no clipboard at all', async () => {
    await open({ stage: 'result' });
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Copy result' }));
    expect(screen.getByRole('status')).toHaveTextContent('would not let us copy');
  });
});
