import { useCallback, useEffect, useRef, useState } from 'react';
import { calculateNet } from '@ledgerly/money';
import { ApiError } from '../api.js';
import { saveHistoryEntry, updateHistoryEntry } from './historyApi.js';
import { track } from './inflight.js';

// Keeps one history record in step with the final amount screen. The first time the screen shows a
// valid result it saves the invoice; every later correction of the amounts updates that same
// record (after a short pause, so typing does not send a request per key). Nothing is sent while
// the amounts are not a valid result, and nothing blocks the screen: a failure only shows a
// "Try again" button. A correction still waiting for its pause is sent at once when the person
// leaves the screen, so going to History straight after typing does not lose it.
//
//   status: 'idle' | 'saving' | 'saved' | 'failed'
//   historyId: the id of the saved record (kept by the caller so a reload does not save twice)
const PAUSE_MS = 500;

export default function useSaveToHistory({ active, token, result, values, historyId, onSaved }) {
  const [status, setStatus] = useState(historyId ? 'saved' : 'idle');
  const [attempt, setAttempt] = useState(0); // changes to ask for another try
  const lastSent = useRef(historyId ? JSON.stringify([values.debit, values.credit]) : '');
  const chain = useRef(Promise.resolve()); // saves go one after another, never two at once
  const idRef = useRef(historyId);
  idRef.current = historyId ?? idRef.current;
  // A new invoice (another picture) starts a new record. The screen that owns this hook stays
  // mounted after "Start a new invoice", so what was saved for the last one must be forgotten.
  const readingKey = result.invoiceId ?? null;
  const lastReading = useRef(readingKey);
  if (lastReading.current !== readingKey) {
    lastReading.current = readingKey;
    idRef.current = historyId ?? null;
    lastSent.current = '';
  }
  const pending = useRef(null); // the save that is waiting for its pause, if any
  const mounted = useRef(true);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const valid = calculateNet(values).ok;
  const key = JSON.stringify([values.debit, values.credit]);

  // The note on the screen belongs to one invoice: a new one starts with none.
  useEffect(() => {
    setStatus(idRef.current ? 'saved' : 'idle');
  }, [readingKey]);

  useEffect(() => {
    // A correction still waiting for its pause is replaced by a newer one, dropped if the amounts
    // are no longer valid, and sent at once if the person has left the final amount screen.
    const waiting = pending.current;
    pending.current = null;
    if (waiting && !active) {
      pending.current = waiting;
      waiting();
    }
    if (!active || !valid || key === lastSent.current) return undefined;
    const amounts = { debit: values.debit, credit: values.credit };
    const job = () => {
      if (pending.current !== job) return; // replaced by a newer correction, or already sent
      pending.current = null;
      chain.current = track(
        chain.current.then(async () => {
          if (mounted.current) setStatus('saving');
          try {
            let entry = null;
            if (idRef.current) {
              try {
                entry = await updateHistoryEntry(idRef.current, amounts, token);
              } catch (err) {
                // Removed from the history list meanwhile: save it again instead.
                if (!(err instanceof ApiError && err.status === 404)) throw err;
              }
            }
            if (!entry) {
              entry = await saveHistoryEntry(
                { ...amounts, imageRef: result.invoiceId, method: result.provider },
                token,
              );
            }
            lastSent.current = key;
            idRef.current = entry.id;
            onSavedRef.current?.(entry.id);
            if (mounted.current) setStatus('saved');
          } catch {
            if (mounted.current) setStatus('failed');
          }
        }),
      );
    };
    pending.current = job;
    const timer = setTimeout(job, idRef.current ? PAUSE_MS : 0);
    return () => clearTimeout(timer);
    // values are read through `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, valid, key, attempt, token, result.invoiceId, result.provider]);

  // Leaving the screen: send a correction that is still waiting for its pause.
  const flush = useRef(null);
  flush.current = () => pending.current?.();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      flush.current();
    };
  }, []);

  const retry = useCallback(() => {
    lastSent.current = '';
    setAttempt((n) => n + 1);
  }, []);

  return { status: !active || !valid ? 'idle' : status, retry };
}
