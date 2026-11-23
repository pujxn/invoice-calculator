import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '../src/api.js';
import * as invoiceApi from '../src/invoices/invoiceApi.js';
import { renderApp, storeSession, stubApi } from './helpers.jsx';

vi.mock('../src/invoices/invoiceApi.js', () => ({
  uploadInvoice: vi.fn(),
  getInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  fetchInvoiceImage: vi.fn(),
  getReadingMethods: vi.fn(),
  extractInvoice: vi.fn(),
}));

const ID = 'a'.repeat(32);
const ID2 = 'b'.repeat(32);
const meta = (id = ID, size = 1234) => ({ id, size, mimeType: 'image/jpeg', createdAt: 'x' });
const photo = (name = 'invoice.jpg', type = 'image/jpeg', size = 1234) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
// The hidden file inputs are what the buttons open; tests give them files directly.
const user = () => userEvent.setup({ applyAccept: false });
const fileInput = () => screen.getByTestId('file-input');

async function openUploadPage() {
  storeSession();
  stubApi({ 'GET /auth/me': [200, { phone: '+447700900123', expiresAt: 'x' }] });
  renderApp('/');
  await screen.findByRole('heading', { name: 'Upload your invoice' });
}

// An upload the test finishes by hand, so the "uploading" screen can be inspected.
function deferredUpload() {
  const d = {};
  invoiceApi.uploadInvoice.mockImplementationOnce(
    (file, opts) =>
      new Promise((resolve, reject) => {
        d.opts = opts;
        d.resolve = resolve;
        d.reject = reject;
        opts.signal.addEventListener('abort', () =>
          reject(new DOMException('Upload cancelled', 'AbortError')),
        );
      }),
  );
  return d;
}

beforeEach(() => {
  vi.clearAllMocks();
  invoiceApi.deleteInvoice.mockResolvedValue({ ok: true });
});

describe('the upload screen', () => {
  it('offers Take photo and Choose file, with the camera and file inputs set up for phones', async () => {
    await openUploadPage();
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument();
    const camera = screen.getByTestId('camera-input');
    expect(camera).toHaveAttribute('capture', 'environment');
    expect(camera).toHaveAttribute('accept', 'image/*');
    expect(camera).not.toHaveAttribute('multiple');
    expect(fileInput().getAttribute('accept')).toMatch(/image\/jpeg.*image\/heic/);
    // Several pictures can be chosen: they go to the batch screen (one picture stays here).
    expect(fileInput()).toHaveAttribute('multiple');
    expect(screen.getByText(/JPEG, PNG, WebP or HEIC, up to 10 MB/)).toBeInTheDocument();
  });

  it('shows a preview, name and size, then "Picture uploaded" after a successful upload', async () => {
    await openUploadPage();
    invoiceApi.uploadInvoice.mockResolvedValueOnce(meta());
    await user().upload(fileInput(), photo('march.jpg'));
    expect(await screen.findByText('Picture uploaded.')).toBeInTheDocument();
    expect(screen.getByAltText('Preview of march.jpg')).toHaveAttribute('src', 'blob:mock/1');
    expect(screen.getByText('march.jpg')).toBeInTheDocument();
    expect(screen.getByText('(1 KB)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace picture' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Choose file' })).toBeNull();
    // The upload was made with the signed-in token.
    expect(invoiceApi.uploadInvoice.mock.calls[0][1].token).toBe('tok-123');
  });

  it('shows the preview and live progress while uploading, and can be cancelled', async () => {
    await openUploadPage();
    const upload = deferredUpload();
    await user().upload(fileInput(), photo('slow.jpg'));
    expect(await screen.findByAltText('Preview of slow.jpg')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Upload progress' })).toHaveValue(0);
    act(() => upload.opts.onProgress(42));
    expect(screen.getByRole('progressbar')).toHaveValue(42);
    expect(screen.getByText('Uploading… 42%')).toBeInTheDocument();

    await user().click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock/1');
  });

  it.each([
    ['a PDF', photo('invoice.pdf', 'application/pdf'), /not a JPEG, PNG, WebP or HEIC/],
    ['an empty file', photo('empty.png', 'image/png', 0), /empty/],
    [
      'a file over 10 MB',
      photo('huge.png', 'image/png', 11 * 1024 * 1024),
      /11.0 MB.*limit is 10 MB/,
    ],
  ])('rejects %s without contacting the server', async (_name, file, message) => {
    await openUploadPage();
    await user().upload(fileInput(), file);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(invoiceApi.uploadInvoice).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument();
  });

  it('shows the server’s message when it refuses a file, and lets the user try again', async () => {
    await openUploadPage();
    invoiceApi.uploadInvoice.mockRejectedValueOnce(
      new ApiError(415, 'That file is not a JPEG, PNG, WebP or HEIC picture.'),
    );
    await user().upload(fileInput(), photo('fake.jpg'));
    expect(await screen.findByRole('alert')).toHaveTextContent('not a JPEG, PNG, WebP or HEIC');
    expect(screen.queryByText('Picture uploaded.')).toBeNull();

    invoiceApi.uploadInvoice.mockResolvedValueOnce(meta());
    await user().upload(fileInput(), photo('real.jpg'));
    expect(await screen.findByText('Picture uploaded.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a friendly message when the server cannot be reached', async () => {
    await openUploadPage();
    invoiceApi.uploadInvoice.mockRejectedValueOnce(new ApiError(0, 'Cannot reach the server.'));
    await user().upload(fileInput(), photo());
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
  });

  it('shows a generic message for an unexpected error', async () => {
    await openUploadPage();
    invoiceApi.uploadInvoice.mockRejectedValueOnce(new Error('boom'));
    await user().upload(fileInput(), photo());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The upload failed. Please try again.',
    );
  });

  it('signs the user out and returns to the login page when the session has ended (401)', async () => {
    await openUploadPage();
    invoiceApi.uploadInvoice.mockRejectedValueOnce(new ApiError(401, 'Please sign in.'));
    await user().upload(fileInput(), photo());
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'));
  });

  it('Remove deletes the picture on the server and brings back the picker', async () => {
    await openUploadPage();
    invoiceApi.uploadInvoice.mockResolvedValueOnce(meta());
    await user().upload(fileInput(), photo());
    await user().click(await screen.findByRole('button', { name: 'Remove' }));
    expect(invoiceApi.deleteInvoice).toHaveBeenCalledWith(ID, 'tok-123');
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock/1');
    expect(sessionStorage.length).toBe(0);
  });

  it('keeps the picture and says so when Remove fails', async () => {
    await openUploadPage();
    invoiceApi.uploadInvoice.mockResolvedValueOnce(meta());
    await user().upload(fileInput(), photo());
    invoiceApi.deleteInvoice.mockRejectedValueOnce(new ApiError(500, 'Something went wrong.'));
    await user().click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(screen.getByText('Picture uploaded.')).toBeInTheDocument();
  });

  it('treats Remove on a picture the server no longer has as success', async () => {
    await openUploadPage();
    invoiceApi.uploadInvoice.mockResolvedValueOnce(meta());
    await user().upload(fileInput(), photo());
    invoiceApi.deleteInvoice.mockRejectedValueOnce(new ApiError(404, 'not found'));
    await user().click(await screen.findByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeInTheDocument();
  });

  it('Replace uploads the new picture first, then deletes the old one', async () => {
    await openUploadPage();
    invoiceApi.uploadInvoice.mockResolvedValueOnce(meta(ID));
    await user().upload(fileInput(), photo('first.jpg'));
    await screen.findByText('Picture uploaded.');

    invoiceApi.uploadInvoice.mockResolvedValueOnce(meta(ID2));
    await user().upload(fileInput(), photo('second.jpg'));
    expect(await screen.findByAltText('Preview of second.jpg')).toBeInTheDocument();
    expect(screen.queryByAltText('Preview of first.jpg')).toBeNull();
    await waitFor(() => expect(invoiceApi.deleteInvoice).toHaveBeenCalledWith(ID, 'tok-123'));
    expect(invoiceApi.deleteInvoice).not.toHaveBeenCalledWith(ID2, expect.anything());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock/1');
    expect(JSON.parse(sessionStorage.getItem('invoice-calculator.current-invoice'))).toEqual({
      id: ID2,
      name: 'second.jpg',
    });
  });

  it('keeps the old picture if a replacement fails', async () => {
    await openUploadPage();
    invoiceApi.uploadInvoice.mockResolvedValueOnce(meta(ID));
    await user().upload(fileInput(), photo('first.jpg'));
    await screen.findByText('Picture uploaded.');

    invoiceApi.uploadInvoice.mockRejectedValueOnce(new ApiError(413, 'That picture is too big.'));
    await user().upload(fileInput(), photo('second.jpg'));
    expect(await screen.findByRole('alert')).toHaveTextContent('too big');
    expect(screen.getByAltText('Preview of first.jpg')).toBeInTheDocument();
    expect(invoiceApi.deleteInvoice).not.toHaveBeenCalled();
  });

  it('shows a "No preview" note when the browser cannot display the picture (e.g. HEIC)', async () => {
    await openUploadPage();
    invoiceApi.uploadInvoice.mockResolvedValueOnce({ ...meta(), mimeType: 'image/heic' });
    await user().upload(fileInput(), photo('IMG_1.HEIC', ''));
    const img = await screen.findByAltText('Preview of IMG_1.HEIC');
    fireEvent.error(img);
    expect(
      await screen.findByRole('img', { name: 'No preview of IMG_1.HEIC' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Picture uploaded.')).toBeInTheDocument();
  });

  it('the camera input also starts an upload', async () => {
    await openUploadPage();
    invoiceApi.uploadInvoice.mockResolvedValueOnce(meta());
    await user().upload(screen.getByTestId('camera-input'), photo('camera.jpg'));
    expect(await screen.findByText('Picture uploaded.')).toBeInTheDocument();
  });

  it('sends several chosen pictures to the batch screen instead of picking one', async () => {
    await openUploadPage();
    invoiceApi.uploadInvoice.mockImplementation(async (file) => meta(file.name.padEnd(32, 'x')));
    invoiceApi.extractInvoice.mockResolvedValue({
      provider: 'ocr',
      confidence: 'high',
      debit: '10.00',
      credit: null,
      warnings: [],
    });
    fireEvent.change(fileInput(), { target: { files: [photo('one.jpg'), photo('two.jpg')] } });
    expect(
      await screen.findByRole('heading', { name: 'Several invoices at once' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Picture uploaded.')).toBeNull();
    await waitFor(() => expect(invoiceApi.uploadInvoice).toHaveBeenCalledTimes(2));
  });
});

describe('coming back to the page', () => {
  const keepPicture = (id = ID, name = 'march.jpg') =>
    sessionStorage.setItem('invoice-calculator.current-invoice', JSON.stringify({ id, name }));

  it('shows the picture uploaded earlier in this tab, fetched with the sign-in token', async () => {
    keepPicture();
    invoiceApi.getInvoice.mockResolvedValue(meta());
    invoiceApi.fetchInvoiceImage.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
    await openUploadPage();
    expect(await screen.findByAltText('Preview of march.jpg')).toBeInTheDocument();
    expect(invoiceApi.fetchInvoiceImage).toHaveBeenCalledWith(ID, 'tok-123');
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('forgets a remembered picture the server no longer has and shows the picker', async () => {
    keepPicture();
    invoiceApi.getInvoice.mockRejectedValue(new ApiError(404, 'not found'));
    invoiceApi.fetchInvoiceImage.mockRejectedValue(new ApiError(404, 'not found'));
    await openUploadPage();
    expect(await screen.findByRole('button', { name: 'Choose file' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(sessionStorage.getItem('invoice-calculator.current-invoice')).toBeNull();
  });

  it('keeps the memory and explains when the server cannot be reached', async () => {
    keepPicture();
    invoiceApi.getInvoice.mockRejectedValue(new ApiError(0, 'Cannot reach the server.'));
    invoiceApi.fetchInvoiceImage.mockRejectedValue(new ApiError(0, 'Cannot reach the server.'));
    await openUploadPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.');
    expect(sessionStorage.getItem('invoice-calculator.current-invoice')).not.toBeNull();
  });

  it('ignores corrupt remembered data', async () => {
    sessionStorage.setItem('invoice-calculator.current-invoice', '{nope');
    await openUploadPage();
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeInTheDocument();
    expect(invoiceApi.getInvoice).not.toHaveBeenCalled();
  });
});
