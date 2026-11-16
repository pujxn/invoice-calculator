import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { ApiError } from '../api.js';
import { deleteInvoice, fetchInvoiceImage, getInvoice, uploadInvoice } from './invoiceApi.js';
import { ACCEPT, MAX_LABEL, TYPE_LABEL, formatSize, validateFile } from './validate.js';

// Remembers the current picture for this browser tab, so a reload shows it again.
const KEEP_KEY = 'invoice-calculator.current-invoice';
const keep = {
  read() {
    try {
      return JSON.parse(sessionStorage.getItem(KEEP_KEY));
    } catch {
      return null;
    }
  },
  write(value) {
    try {
      if (value) sessionStorage.setItem(KEEP_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(KEEP_KEY);
    } catch {
      // storage blocked: the picture simply is not remembered across reloads
    }
  },
};

function Preview({ url, name }) {
  const [failed, setFailed] = useState(false);
  // A new picture gets a fresh chance to load.
  useEffect(() => setFailed(false), [url]);
  if (failed) {
    return (
      <div className="preview preview-missing" role="img" aria-label={`No preview of ${name}`}>
        <p>
          <strong>No preview</strong>
          <br />
          This browser cannot show this kind of picture. It will still be used.
        </p>
      </div>
    );
  }
  return (
    <div className="preview">
      <img src={url} alt={`Preview of ${name}`} onError={() => setFailed(true)} />
    </div>
  );
}

export default function InvoiceUpload() {
  const { token, logout } = useAuth();
  const [current, setCurrent] = useState(null); // { id, name, size, mimeType, previewUrl }
  const [uploading, setUploading] = useState(null); // { name, size, previewUrl, progress }
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(() => keep.read() !== null);
  const abortRef = useRef(null);
  const fileInput = useRef(null);
  const cameraInput = useRef(null);
  const urls = useRef(new Set()); // every object URL we made, revoked on unmount

  const makeUrl = useCallback((blob) => {
    const url = URL.createObjectURL(blob);
    urls.current.add(url);
    return url;
  }, []);
  const dropUrl = useCallback((url) => {
    if (url && urls.current.delete(url)) URL.revokeObjectURL(url);
  }, []);

  // A 401 means the session ended: sign out locally, and the route guard shows the login page.
  const handleFailure = useCallback(
    (err, fallback) => {
      if (err instanceof ApiError && err.status === 401) {
        logout();
        return;
      }
      setError(err instanceof ApiError ? err.message : fallback);
    },
    [logout],
  );

  // On first load, show the picture this tab uploaded earlier, if it still exists.
  useEffect(() => {
    const saved = keep.read();
    if (!saved || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const [meta, blob] = await Promise.all([
          getInvoice(saved.id, token),
          fetchInvoiceImage(saved.id, token),
        ]);
        if (cancelled) return;
        setCurrent({
          id: meta.id,
          name: saved.name || 'Invoice picture',
          size: meta.size,
          mimeType: meta.mimeType,
          previewUrl: makeUrl(blob),
        });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) keep.write(null);
        else handleFailure(err, 'Could not load your earlier picture.');
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once; token changes only on sign-in/out, which remounts this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const made = urls.current;
    return () => {
      abortRef.current?.abort();
      made.forEach((u) => URL.revokeObjectURL(u));
      made.clear();
    };
  }, []);

  async function choose(file) {
    setError('');
    const problem = validateFile(file);
    if (problem) return setError(problem);

    const controller = new AbortController();
    abortRef.current = controller;
    const previewUrl = makeUrl(file);
    setUploading({ name: file.name, size: file.size, previewUrl, progress: 0 });
    try {
      const meta = await uploadInvoice(file, {
        token,
        signal: controller.signal,
        onProgress: (progress) => setUploading((u) => u && { ...u, progress }),
      });
      const previous = current;
      setCurrent({
        id: meta.id,
        name: file.name,
        size: meta.size,
        mimeType: meta.mimeType,
        previewUrl,
      });
      keep.write({ id: meta.id, name: file.name });
      if (previous) {
        dropUrl(previous.previewUrl);
        // Replacing: the old picture is no longer needed. Failure here is harmless
        // (the server also deletes old pictures after a day).
        deleteInvoice(previous.id, token).catch(() => {});
      }
    } catch (err) {
      dropUrl(previewUrl);
      if (err?.name !== 'AbortError') handleFailure(err, 'The upload failed. Please try again.');
    } finally {
      setUploading(null);
      abortRef.current = null;
    }
  }

  function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be chosen again after an error or removal
    if (file) choose(file);
  }

  async function remove() {
    setError('');
    try {
      await deleteInvoice(current.id, token);
    } catch (err) {
      // Already gone on the server is the same as removed.
      if (!(err instanceof ApiError && err.status === 404)) {
        return handleFailure(err, 'Could not remove the picture. Please try again.');
      }
    }
    dropUrl(current.previewUrl);
    setCurrent(null);
    keep.write(null);
  }

  const picker = (
    <>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        hidden
        data-testid="file-input"
        onChange={onPick}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="camera-input"
        onChange={onPick}
      />
    </>
  );

  return (
    <section className="upload" aria-labelledby="upload-title">
      <h2 id="upload-title">Upload your invoice</h2>
      <p className="hint">
        Take a clear photo of the whole invoice, or choose one you already have. {TYPE_LABEL}, up to{' '}
        {MAX_LABEL}.
      </p>
      {picker}

      {error && (
        <p className="status bad" role="alert">
          {error}
        </p>
      )}

      {restoring && <p className="hint">Loading your earlier picture…</p>}

      {uploading && (
        <div className="picture" aria-busy="true">
          <Preview url={uploading.previewUrl} name={uploading.name} />
          <p className="filename">
            {uploading.name} <span className="hint">({formatSize(uploading.size)})</span>
          </p>
          <progress max="100" value={uploading.progress} aria-label="Upload progress" />
          <p className="hint" role="status">
            Uploading… {uploading.progress}%
          </p>
          <div className="actions">
            <button type="button" className="secondary" onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {!uploading && current && (
        <div className="picture">
          <Preview url={current.previewUrl} name={current.name} />
          <p className="filename">
            {current.name} <span className="hint">({formatSize(current.size)})</span>
          </p>
          <p className="status good" role="status">
            Picture uploaded.
          </p>
          <div className="actions">
            <button type="button" className="secondary" onClick={() => fileInput.current.click()}>
              Replace picture
            </button>
            <button type="button" className="secondary" onClick={remove}>
              Remove
            </button>
          </div>
          <p className="hint">Reading the amounts from this picture comes in the next step.</p>
        </div>
      )}

      {!uploading && !current && !restoring && (
        <div className="actions pick">
          <button type="button" className="camera-only" onClick={() => cameraInput.current.click()}>
            Take photo
          </button>
          <button type="button" onClick={() => fileInput.current.click()}>
            Choose file
          </button>
        </div>
      )}
    </section>
  );
}
