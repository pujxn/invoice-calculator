import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api.js';
import { BATCH_KEY } from '../storageKeys.js';
import { deleteInvoice, extractInvoice, uploadInvoice } from './invoiceApi.js';
import { BUSY, CONCURRENCY, admit, admitNote, makeItem, restore } from './batch.js';

const BUSY_RETRIES = 4; // the server says "busy, try in a moment": wait and ask again, this many times
const MAX_AUTO_WAIT = 30; // seconds; a longer wait (an hourly limit) is shown to the person instead

const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Cancelled', 'AbortError'));
      },
      { once: true },
    );
  });

function load(phone) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(BATCH_KEY));
    return saved?.phone === phone ? restore(saved.items) : [];
  } catch {
    return [];
  }
}

function save(phone, items) {
  try {
    if (items.length) sessionStorage.setItem(BATCH_KEY, JSON.stringify({ phone, items }));
    else sessionStorage.removeItem(BATCH_KEY);
  } catch {
    // storage blocked: the batch is simply not remembered across reloads
  }
}

function describe(err, fallback) {
  if (err instanceof ApiError && err.status === 429 && err.data?.retryAfterSeconds) {
    const secs = err.data.retryAfterSeconds;
    return `${err.message} Try again in ${secs < 90 ? `${secs} seconds` : `${Math.ceil(secs / 60)} minutes`}.`;
  }
  return err instanceof ApiError ? err.message : fallback;
}

// The batch: a list of invoices, each uploaded and read on its own, a few at a time. A picture
// that cannot be read fails alone (it can be retried, typed by hand or removed) and never stops
// the others. Reading goes through the same two calls the single-invoice screen uses
// (uploadInvoice, extractInvoice), so whichever reader the server has is the one used.
export default function useBatch({ token, phone, onSignedOut }) {
  const [items, setItems] = useState(() => load(phone));
  const [note, setNote] = useState('');
  const itemsRef = useRef(items);
  const files = useRef(new Map()); // key -> File, while the browser still has it
  const running = useRef(new Map()); // key -> AbortController, for pictures being sent or read
  const method = useRef(undefined); // how to read ("ocr", "claude"), set by the screen
  const alive = useRef(true);

  const commit = useCallback((next) => {
    itemsRef.current = next;
    setItems(next);
  }, []);
  const patch = useCallback(
    (key, changes) =>
      commit(itemsRef.current.map((i) => (i.key === key ? { ...i, ...changes } : i))),
    [commit],
  );

  useEffect(() => save(phone, items), [phone, items]);

  const run = useCallback(
    async (key) => {
      const item = itemsRef.current.find((i) => i.key === key);
      const file = files.current.get(key);
      if (!item) return;
      const controller = new AbortController();
      running.current.set(key, controller);
      const { signal } = controller;
      try {
        let id = item.invoiceId;
        if (!id) {
          patch(key, { status: 'uploading', error: '' });
          id = (await uploadInvoice(file, { token, signal })).id;
          patch(key, { invoiceId: id });
        }
        patch(key, { status: 'reading', error: '' });
        let result;
        for (let attempt = 0; ; attempt += 1) {
          try {
            result = await extractInvoice(id, { token, signal, method: method.current });
            break;
          } catch (err) {
            const secs =
              err instanceof ApiError && err.status === 429 && err.data?.retryAfterSeconds;
            if (!secs || secs > MAX_AUTO_WAIT || attempt >= BUSY_RETRIES) throw err;
            await wait(secs * 1000, signal); // the reader is busy with other pictures: try again shortly
          }
        }
        files.current.delete(key); // read: the server has deleted the picture and we do not need the file
        patch(key, {
          status: 'done',
          error: '',
          invoiceId: null,
          debit: result.debit ?? '',
          credit: result.credit ?? '',
          read: {
            provider: result.provider,
            confidence: result.confidence,
            warnings: result.warnings ?? [],
            notes: result.notes ?? '',
          },
        });
      } catch (err) {
        if (err?.name === 'AbortError') {
          // Removed (the invoice is gone): nothing to show. Cancelled because this screen went
          // away: put it back in the queue so it starts again if the screen returns.
          if (itemsRef.current.some((i) => i.key === key)) patch(key, { status: 'queued' });
          return;
        }
        if (err instanceof ApiError && err.status === 401) return onSignedOut?.();
        const gone = err instanceof ApiError && err.status === 404;
        patch(key, {
          status: 'failed',
          // 404: the picture expired or was removed on the server; a retry sends it again.
          ...(gone ? { invoiceId: null } : {}),
          error: gone
            ? 'That picture is no longer on the server. Retry sends it again.'
            : describe(err, 'Reading the picture failed. Please try again.'),
        });
      } finally {
        running.current.delete(key);
        if (alive.current) pumpRef.current();
      }
    },
    [token, patch, onSignedOut],
  );

  // Starts waiting invoices until CONCURRENCY are in flight.
  function pump() {
    for (const item of itemsRef.current) {
      if (running.current.size >= CONCURRENCY) return;
      if (item.status !== 'queued' || running.current.has(item.key)) continue;
      if (!item.invoiceId && !files.current.has(item.key)) continue; // nothing to send
      running.current.set(item.key, new AbortController()); // claims the slot before run() starts
      run(item.key);
    }
  }
  const pumpRef = useRef(pump);
  pumpRef.current = pump;

  useEffect(() => {
    alive.current = true;
    pumpRef.current();
    const controllers = running.current;
    return () => {
      alive.current = false;
      controllers.forEach((c) => c.abort());
    };
  }, []);

  const add = useCallback(
    (picked) => {
      const list = Array.from(picked ?? []);
      if (!list.length) return;
      const { fresh, duplicates, overflow } = admit(itemsRef.current, list);
      setNote(admitNote({ duplicates, overflow }));
      const added = fresh.map((file) => {
        const item = makeItem(file);
        if (!item.rejected) files.current.set(item.key, file);
        return item;
      });
      commit([...itemsRef.current, ...added]);
      pumpRef.current();
    },
    [commit],
  );

  const change = useCallback((key, field, text) => patch(key, { [field]: text }), [patch]);

  const retry = useCallback(
    (key) => {
      patch(key, { status: 'queued', error: '' });
      pumpRef.current();
    },
    [patch],
  );
  const retryAll = useCallback(() => {
    commit(
      itemsRef.current.map((i) =>
        i.status === 'failed' && !i.rejected && (i.invoiceId || files.current.has(i.key))
          ? { ...i, status: 'queued', error: '' }
          : i,
      ),
    );
    pumpRef.current();
  }, [commit]);

  // Gives up reading a failed invoice and lets the person type its amounts.
  const typeByHand = useCallback(
    (key) => {
      const item = itemsRef.current.find((i) => i.key === key);
      if (item?.invoiceId) deleteInvoice(item.invoiceId, token).catch(() => {});
      files.current.delete(key);
      patch(key, {
        status: 'done',
        error: '',
        invoiceId: null,
        read: { provider: 'manual', confidence: null, warnings: [], notes: '' },
      });
    },
    [patch, token],
  );

  const remove = useCallback(
    (key) => {
      const item = itemsRef.current.find((i) => i.key === key);
      running.current.get(key)?.abort();
      running.current.delete(key);
      files.current.delete(key);
      if (item?.invoiceId) deleteInvoice(item.invoiceId, token).catch(() => {});
      commit(itemsRef.current.filter((i) => i.key !== key));
      pumpRef.current();
    },
    [commit, token],
  );

  const clear = useCallback(() => {
    for (const item of itemsRef.current) {
      running.current.get(item.key)?.abort();
      if (item.invoiceId) deleteInvoice(item.invoiceId, token).catch(() => {});
    }
    running.current.clear();
    files.current.clear();
    setNote('');
    commit([]);
  }, [commit, token]);

  const setMethod = useCallback((id) => {
    method.current = id;
  }, []);

  return {
    items,
    note,
    busy: items.some((i) => BUSY.has(i.status)),
    haveFile: (key) => files.current.has(key),
    add,
    change,
    retry,
    retryAll,
    typeByHand,
    remove,
    clear,
    setMethod,
  };
}
