import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as invoiceApi from '../src/invoices/invoiceApi.js';
import { METHOD_KEY } from '../src/storageKeys.js';
import { renderApp, storeSession, stubApi } from './helpers.jsx';

vi.mock('../src/invoices/invoiceApi.js', () => ({
  uploadInvoice: vi.fn(),
  getInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  fetchInvoiceImage: vi.fn(),
  extractInvoice: vi.fn(),
  getReadingMethods: vi.fn(),
}));

const ID = 'a'.repeat(32);
const BOTH = {
  default: 'ocr',
  methods: [
    { id: 'ocr', label: 'Local OCR', available: true },
    { id: 'claude', label: 'AI (Claude)', available: true },
  ],
};
const NO_KEY = {
  default: 'ocr',
  methods: [
    { id: 'ocr', label: 'Local OCR', available: true },
    {
      id: 'claude',
      label: 'AI (Claude)',
      available: false,
      reason: 'AI reading is not set up on this server (no ANTHROPIC_API_KEY).',
    },
  ],
};
const reading = (over = {}) => ({
  invoiceId: ID,
  provider: 'ocr',
  model: 'tesseract',
  imageDeleted: true,
  debit: '1250.50',
  credit: '400.00',
  currency: 'INR',
  confidence: 'high',
  notes: '',
  warnings: [],
  ...over,
});

const user = () => userEvent.setup({ applyAccept: false });
const radio = (name) => screen.getByRole('radio', { name });

async function open(methods) {
  invoiceApi.getReadingMethods.mockResolvedValue(methods);
  storeSession();
  stubApi({ 'GET /auth/me': [200, { phone: '+447700900123', expiresAt: 'x' }] });
  invoiceApi.uploadInvoice.mockResolvedValue({
    id: ID,
    size: 1234,
    mimeType: 'image/jpeg',
    createdAt: 'x',
  });
  renderApp('/');
  await screen.findByTestId('file-input');
}
async function upload() {
  await user().upload(
    screen.getByTestId('file-input'),
    new File(['x'], 'march.jpg', { type: 'image/jpeg' }),
  );
  await screen.findByText('Picture uploaded.');
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  invoiceApi.deleteInvoice.mockResolvedValue({ ok: true });
});

describe('the "Read with" switch', () => {
  it('shows Local OCR chosen when the server defaults to it, and AI when it is available', async () => {
    await open(BOTH);
    expect(await screen.findByRole('group', { name: 'Read with' })).toBeInTheDocument();
    expect(radio('Local OCR')).toBeChecked();
    expect(radio('AI (Claude)')).toBeEnabled();
    expect(screen.getByText(/Free and private/)).toBeInTheDocument();
  });

  it('greys out AI with the reason when the server has no key', async () => {
    await open(NO_KEY);
    await screen.findByRole('group', { name: 'Read with' });
    expect(radio('AI (Claude)')).toBeDisabled();
    expect(radio('AI (Claude)')).toHaveAccessibleDescription(/no ANTHROPIC_API_KEY/);
    expect(screen.getByText(/AI \(Claude\) is not available/)).toBeInTheDocument();
    await user().click(radio('AI (Claude)'));
    expect(radio('Local OCR')).toBeChecked();
  });

  it('is hidden when there is nothing to choose between or the list cannot be fetched', async () => {
    await open({
      default: 'mock',
      methods: [{ id: 'mock', label: 'Demo values', available: true }],
    });
    await upload();
    expect(screen.queryByRole('group', { name: 'Read with' })).toBeNull();
    expect(invoiceApi.getReadingMethods).toHaveBeenCalledWith('tok-123');
  });

  it('is hidden when the list fails, and reading then lets the server choose', async () => {
    invoiceApi.getReadingMethods.mockRejectedValue(new Error('down'));
    storeSession();
    stubApi({ 'GET /auth/me': [200, { phone: '+447700900123', expiresAt: 'x' }] });
    invoiceApi.uploadInvoice.mockResolvedValue({
      id: ID,
      size: 1,
      mimeType: 'image/jpeg',
      createdAt: 'x',
    });
    invoiceApi.extractInvoice.mockResolvedValueOnce(reading());
    renderApp('/');
    await screen.findByTestId('file-input');
    await upload();
    expect(screen.queryByRole('group', { name: 'Read with' })).toBeNull();
    await user().click(screen.getByRole('button', { name: 'Read amounts' }));
    await screen.findByRole('heading', { name: 'Amounts we found' });
    expect(invoiceApi.extractInvoice.mock.calls[0][1].method).toBeUndefined();
  });

  it('sends the chosen method with the reading and says which reader was used', async () => {
    await open(BOTH);
    await screen.findByRole('group', { name: 'Read with' });
    await user().click(radio('AI (Claude)'));
    expect(radio('AI (Claude)')).toBeChecked();
    expect(screen.getByText(/Sent to the AI service/)).toBeInTheDocument();
    await upload();
    invoiceApi.extractInvoice.mockResolvedValueOnce(reading({ provider: 'claude' }));
    await user().click(screen.getByRole('button', { name: 'Read amounts' }));
    await screen.findByRole('heading', { name: 'Amounts we found' });
    expect(invoiceApi.extractInvoice.mock.calls[0][1].method).toBe('claude');
    expect(screen.getByTestId('read-with')).toHaveTextContent('AI (Claude)');
    expect(screen.getByText(/Read from your picture by AI\./)).toBeInTheDocument();
  });

  it('reads with local OCR by default and says so, with its own loading and result text', async () => {
    await open(BOTH);
    await screen.findByRole('group', { name: 'Read with' });
    await upload();
    let finish;
    invoiceApi.extractInvoice.mockImplementationOnce(() => new Promise((r) => (finish = r)));
    await user().click(screen.getByRole('button', { name: 'Read amounts' }));
    expect(await screen.findByText(/with local OCR/)).toBeInTheDocument();
    // Cannot be switched in the middle of a reading.
    expect(radio('AI (Claude)')).toBeDisabled();
    await act(async () => finish(reading()));
    await screen.findByRole('heading', { name: 'Amounts we found' });
    expect(invoiceApi.extractInvoice.mock.calls[0][1].method).toBe('ocr');
    expect(screen.getByTestId('read-with')).toHaveTextContent('Local OCR');
    expect(screen.getByText(/local OCR \(free, no AI\)/)).toBeInTheDocument();
  });

  it('remembers the choice for this tab, but only when it can still be used', async () => {
    sessionStorage.setItem(METHOD_KEY, 'claude');
    await open(BOTH);
    await screen.findByRole('group', { name: 'Read with' });
    expect(radio('AI (Claude)')).toBeChecked();
    expect(sessionStorage.getItem(METHOD_KEY)).toBe('claude');
  });

  it('falls back to the default when the remembered choice is not available any more', async () => {
    sessionStorage.setItem(METHOD_KEY, 'claude');
    await open(NO_KEY);
    await screen.findByRole('group', { name: 'Read with' });
    await waitFor(() => expect(radio('Local OCR')).toBeChecked());
  });

  it('stores a new choice', async () => {
    await open(BOTH);
    await screen.findByRole('group', { name: 'Read with' });
    await user().click(radio('AI (Claude)'));
    expect(sessionStorage.getItem(METHOD_KEY)).toBe('claude');
    await user().click(radio('Local OCR'));
    expect(sessionStorage.getItem(METHOD_KEY)).toBe('ocr');
  });

  it('moves with the arrow keys', async () => {
    await open(BOTH);
    await screen.findByRole('group', { name: 'Read with' });
    radio('Local OCR').focus();
    await user().keyboard('{ArrowRight}');
    expect(radio('AI (Claude)')).toBeChecked();
  });
});
