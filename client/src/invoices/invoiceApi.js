import { api, ApiError } from '../api.js';

// Uploads use XMLHttpRequest because fetch cannot report upload progress.
// Resolves with the server's picture details; rejects with ApiError, or an AbortError if cancelled.
export function uploadInvoice(file, { token, onProgress, signal } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/invoices');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // leave data empty; the status code still tells the story
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      reject(new ApiError(xhr.status, data.error || 'The upload failed. Please try again.', data));
    };
    xhr.onerror = () =>
      reject(new ApiError(0, 'Cannot reach the server. Check your connection and try again.'));
    xhr.ontimeout = xhr.onerror;
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));

    if (signal) {
      if (signal.aborted) return reject(new DOMException('Upload cancelled', 'AbortError'));
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    const form = new FormData();
    form.append('image', file, file.name);
    xhr.send(form);
  });
}

export const getInvoice = (id, token) => api(`/invoices/${id}`, { token });

export const deleteInvoice = (id, token) => api(`/invoices/${id}`, { method: 'DELETE', token });

// The picture needs the sign-in token, which an <img src> cannot send, so it is fetched as a blob.
export async function fetchInvoiceImage(id, token) {
  let res;
  try {
    res = await fetch(`/api/invoices/${id}/image`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error || 'Could not load the picture.', data);
  }
  return res.blob();
}
