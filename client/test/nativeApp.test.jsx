import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as invoiceApi from '../src/invoices/invoiceApi.js';
import { renderApp, storeSession, stubApi } from './helpers.jsx';

// The same upload screen as in a browser, but running inside the iOS or Android app.
vi.mock('../src/invoices/invoiceApi.js', () => ({
  uploadInvoice: vi.fn(),
  getInvoice: vi.fn(),
  deleteInvoice: vi.fn(),
  fetchInvoiceImage: vi.fn(),
  extractInvoice: vi.fn(),
}));
const platform = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  platformName: vi.fn(() => 'ios'),
}));
vi.mock('../src/platform/platform.js', () => platform);
const camera = vi.hoisted(() => {
  class CaptureError extends Error {}
  class UnavailableError extends Error {}
  return { takePhoto: vi.fn(), choosePhoto: vi.fn(), CaptureError, UnavailableError };
});
vi.mock('../src/platform/camera.js', () => camera);

const ID = 'a'.repeat(32);
const photo = (name = 'invoice-1.jpg') => new File(['x'], name, { type: 'image/jpeg' });
const user = () => userEvent.setup({ applyAccept: false });

async function openUploadPage() {
  storeSession();
  stubApi({ 'GET /auth/me': [200, { phone: '+447700900123', expiresAt: 'x' }] });
  renderApp('/');
  await screen.findByRole('heading', { name: 'Upload your invoice' });
}

beforeEach(() => {
  vi.clearAllMocks();
  platform.isNative.mockReturnValue(true);
  invoiceApi.deleteInvoice.mockResolvedValue({ ok: true });
  invoiceApi.uploadInvoice.mockResolvedValue({ id: ID, size: 1, mimeType: 'image/jpeg' });
});

describe('the upload screen inside the mobile app', () => {
  it('calls the native camera for Take photo and uploads what it returns', async () => {
    camera.takePhoto.mockResolvedValue(photo('shot.jpg'));
    await openUploadPage();
    await user().click(screen.getByRole('button', { name: 'Take photo' }));
    expect(camera.takePhoto).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Picture uploaded.')).toBeInTheDocument();
    expect(invoiceApi.uploadInvoice.mock.calls[0][0].name).toBe('shot.jpg');
    expect(invoiceApi.uploadInvoice.mock.calls[0][1].token).toBe('tok-123');
  });

  it('offers the photo library as "Choose from photos"', async () => {
    camera.choosePhoto.mockResolvedValue(photo('library.jpg'));
    await openUploadPage();
    expect(screen.queryByRole('button', { name: 'Choose file' })).toBeNull();
    await user().click(screen.getByRole('button', { name: 'Choose from photos' }));
    expect(camera.choosePhoto).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Picture uploaded.')).toBeInTheDocument();
  });

  it('uses the photo library for "Replace picture" too', async () => {
    camera.takePhoto.mockResolvedValue(photo('first.jpg'));
    camera.choosePhoto.mockResolvedValue(photo('second.jpg'));
    invoiceApi.uploadInvoice.mockResolvedValueOnce({ id: ID, size: 1, mimeType: 'image/jpeg' });
    await openUploadPage();
    await user().click(screen.getByRole('button', { name: 'Take photo' }));
    await user().click(await screen.findByRole('button', { name: 'Replace picture' }));
    expect(camera.choosePhoto).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(invoiceApi.uploadInvoice).toHaveBeenCalledTimes(2));
  });

  it('does nothing, and shows no error, when the person closes the camera', async () => {
    camera.takePhoto.mockResolvedValue(null);
    await openUploadPage();
    await user().click(screen.getByRole('button', { name: 'Take photo' }));
    expect(invoiceApi.uploadInvoice).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument();
  });

  it('shows the plain-words message when the camera or photos are refused', async () => {
    camera.takePhoto.mockRejectedValue(new camera.CaptureError('Allow the camera in Settings.'));
    await openUploadPage();
    await user().click(screen.getByRole('button', { name: 'Take photo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Allow the camera in Settings.');
  });

  it('shows a generic message for an unexpected failure', async () => {
    camera.choosePhoto.mockRejectedValue(new TypeError('x is not a function'));
    await openUploadPage();
    await user().click(screen.getByRole('button', { name: 'Choose from photos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not get the picture.');
  });

  it('still checks the picture before uploading (size and type)', async () => {
    const big = photo('big.jpg');
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    camera.takePhoto.mockResolvedValue(big);
    await openUploadPage();
    await user().click(screen.getByRole('button', { name: 'Take photo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/limit is 10 MB/);
    expect(invoiceApi.uploadInvoice).not.toHaveBeenCalled();
  });

  it('falls back to the web file inputs when the native plugin is not there', async () => {
    camera.takePhoto.mockRejectedValue(new camera.UnavailableError('no plugin'));
    await openUploadPage();
    const click = vi
      .spyOn(screen.getByTestId('camera-input'), 'click')
      .mockImplementation(() => {});
    await user().click(screen.getByRole('button', { name: 'Take photo' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the same screen in a browser', () => {
  it('keeps the file inputs and never touches the native camera', async () => {
    platform.isNative.mockReturnValue(false);
    await openUploadPage();
    const click = vi.spyOn(screen.getByTestId('file-input'), 'click').mockImplementation(() => {});
    await user().click(screen.getByRole('button', { name: 'Choose file' }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(camera.choosePhoto).not.toHaveBeenCalled();
    expect(camera.takePhoto).not.toHaveBeenCalled();
  });
});
