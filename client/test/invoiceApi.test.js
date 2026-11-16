import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api.js';
import {
  deleteInvoice,
  fetchInvoiceImage,
  getInvoice,
  uploadInvoice,
} from '../src/invoices/invoiceApi.js';
import { jsonResponse } from './helpers.jsx';

// A minimal stand-in for XMLHttpRequest that tests drive by hand.
class FakeXhr {
  static last;
  constructor() {
    FakeXhr.last = this;
    this.headers = {};
    this.upload = {};
    this.aborted = false;
  }
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k, v) {
    this.headers[k] = v;
  }
  send(body) {
    this.body = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  respond(status, json) {
    this.status = status;
    this.responseText = typeof json === 'string' ? json : JSON.stringify(json);
    this.onload();
  }
}

const photo = new File(['abc'], 'inv.jpg', { type: 'image/jpeg' });

afterEach(() => vi.unstubAllGlobals());

describe('uploadInvoice', () => {
  it('posts a multipart form with the picture in field "image" and the bearer token', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const promise = uploadInvoice(photo, { token: 'tok' });
    const xhr = FakeXhr.last;
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/invoices');
    expect(xhr.headers).toEqual({ Authorization: 'Bearer tok' });
    expect(xhr.body.get('image').name).toBe('inv.jpg');
    xhr.respond(201, { id: 'a'.repeat(32), size: 3 });
    await expect(promise).resolves.toMatchObject({ size: 3 });
  });

  it('reports progress as whole percentages, ignoring unknown totals', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const seen = [];
    const promise = uploadInvoice(photo, { token: 't', onProgress: (p) => seen.push(p) });
    const xhr = FakeXhr.last;
    xhr.upload.onprogress({ lengthComputable: true, loaded: 1, total: 3 });
    xhr.upload.onprogress({ lengthComputable: false, loaded: 2, total: 0 });
    xhr.upload.onprogress({ lengthComputable: true, loaded: 3, total: 3 });
    xhr.respond(201, {});
    await promise;
    expect(seen).toEqual([33, 100]);
  });

  it('turns server errors into ApiError with the server message and status', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const promise = uploadInvoice(photo, { token: 't' });
    FakeXhr.last.respond(415, { error: 'That file is not a picture.' });
    await expect(promise).rejects.toMatchObject({
      status: 415,
      message: 'That file is not a picture.',
    });
    await promise.catch((e) => expect(e).toBeInstanceOf(ApiError));
  });

  it('uses a plain message when the error body is not JSON (e.g. a proxy page)', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const promise = uploadInvoice(photo, { token: 't' });
    FakeXhr.last.respond(502, '<html>Bad gateway</html>');
    await expect(promise).rejects.toMatchObject({ status: 502, message: /upload failed/ });
  });

  it('reports a network failure as status 0', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const promise = uploadInvoice(photo, { token: 't' });
    FakeXhr.last.onerror();
    await expect(promise).rejects.toMatchObject({ status: 0, message: /Cannot reach the server/ });
  });

  it('can be cancelled with an AbortSignal, before or during the upload', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const controller = new AbortController();
    const promise = uploadInvoice(photo, { token: 't', signal: controller.signal });
    controller.abort();
    expect(FakeXhr.last.aborted).toBe(true);
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });

    const early = new AbortController();
    early.abort();
    await expect(uploadInvoice(photo, { token: 't', signal: early.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('getInvoice, deleteInvoice, fetchInvoiceImage', () => {
  it('call the right endpoints with the token', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await getInvoice('abc', 'tok');
    await deleteInvoice('abc', 'tok');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/invoices/abc');
    expect(fetchMock.mock.calls[0][1].method).toBe('GET');
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer tok');
  });

  it('fetchInvoiceImage returns the blob, sending the token in a header', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, blob: async () => blob }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchInvoiceImage('abc', 'tok')).resolves.toBe(blob);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/invoices/abc/image');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok');
  });

  it('fetchInvoiceImage throws ApiError for 404 and for network failures', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse(404, { error: 'Invoice picture not found.' }));
    await expect(fetchInvoiceImage('abc', 'tok')).rejects.toMatchObject({
      status: 404,
      message: 'Invoice picture not found.',
    });
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    await expect(fetchInvoiceImage('abc', 'tok')).rejects.toMatchObject({ status: 0 });
  });
});
