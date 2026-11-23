import { calculateNet, calculateTotals } from '@ledgerly/money';
import { amountFlag } from './amounts.js';
import { validateFile } from './validate.js';

// Batch upload: many invoice pictures at once, each read on its own, then one combined total.
// This file holds the plain, testable parts (no React): what an invoice in a batch looks like,
// how files are admitted, how the saved copy is restored, and how the combined total is worked out.

// Pictures sent and read at the same time. The server reads one at a time (local OCR) and lets a
// few wait, so a handful in flight keeps it busy without being refused.
export const CONCURRENCY = 3;
// Most invoices in one batch.
export const MAX_BATCH = 100;

// queued: waiting its turn · uploading · reading · done: amounts ready (editable) · failed
export const BUSY = new Set(['queued', 'uploading', 'reading']);

let counter = 0;
export const newKey = () => `b${Date.now().toString(36)}${(counter += 1).toString(36)}`;

// A new invoice in the batch. A file that is not a picture we accept starts out failed, with the
// reason, so the person sees which file was left out.
export function makeItem(file) {
  const problem = validateFile(file);
  return {
    key: newKey(),
    name: file.name || 'Invoice picture',
    size: file.size ?? 0,
    stamp: file.lastModified ?? 0, // with name and size, tells a file already in the batch
    status: problem ? 'failed' : 'queued',
    error: problem ?? '',
    rejected: Boolean(problem), // cannot be retried: the file itself is not usable
    invoiceId: null, // the picture on the server, while there is one (kept so a failed reading can be retried)
    debit: '',
    credit: '',
    read: null, // { provider, confidence, warnings, notes } of the reading, or null
    imageRef: null, // the picture's id, kept for the history record after the picture is deleted
    historyId: null, // this invoice's record in the saved history, once saved
    savedKey: null, // the amounts last saved to the history (see amountsKey)
    failedKey: null, // the amounts that could not be saved, so it is not retried in a loop
    save: null, // 'saving' while a save is on its way
  };
}

const sameFile = (item, file) =>
  item.name === (file.name || 'Invoice picture') &&
  item.size === (file.size ?? 0) &&
  item.stamp === (file.lastModified ?? 0);

// Decides which of the chosen files join the batch. Returns { fresh, duplicates, overflow }:
// files already in the batch are skipped (adding one twice would count it twice), and so are
// files beyond MAX_BATCH.
export function admit(existing, files) {
  const fresh = [];
  let duplicates = 0;
  let overflow = 0;
  for (const file of files) {
    if (existing.some((i) => sameFile(i, file)) || fresh.some((f) => sameFile(makeStub(f), file))) {
      duplicates += 1;
    } else if (existing.length + fresh.length >= MAX_BATCH) {
      overflow += 1;
    } else {
      fresh.push(file);
    }
  }
  return { fresh, duplicates, overflow };
}
const makeStub = (file) => ({
  name: file.name || 'Invoice picture',
  size: file.size ?? 0,
  stamp: file.lastModified ?? 0,
});

// The sentence shown after files were added and some were not.
export function admitNote({ duplicates, overflow }) {
  const parts = [];
  if (duplicates) {
    parts.push(
      `${duplicates} ${duplicates === 1 ? 'file was' : 'files were'} already in the list and ${duplicates === 1 ? 'was' : 'were'} skipped`,
    );
  }
  if (overflow) {
    parts.push(
      `${overflow} ${overflow === 1 ? 'file was' : 'files were'} not added: a batch holds up to ${MAX_BATCH} invoices`,
    );
  }
  return parts.length ? `${parts.join('. ')}.` : '';
}

// What is kept for a reload: the files themselves cannot be, so a picture that had not been read
// yet is shown as failed ("add it again"), and one that was being read can be read again if its
// picture is still on the server.
export function restore(saved) {
  if (!Array.isArray(saved)) return [];
  return saved
    .filter((i) => i && typeof i.key === 'string' && typeof i.name === 'string')
    .map((i) => {
      const item = {
        key: i.key,
        name: i.name,
        size: Number(i.size) || 0,
        stamp: Number(i.stamp) || 0,
        status: i.status,
        error: i.error ?? '',
        rejected: Boolean(i.rejected),
        invoiceId: typeof i.invoiceId === 'string' ? i.invoiceId : null,
        debit: String(i.debit ?? ''),
        credit: String(i.credit ?? ''),
        read: i.read ?? null,
        imageRef: typeof i.imageRef === 'string' ? i.imageRef : null,
        historyId: typeof i.historyId === 'string' ? i.historyId : null,
        savedKey: typeof i.savedKey === 'string' ? i.savedKey : null,
        failedKey: null, // a reload tries a failed save again
        save: null,
      };
      if (BUSY.has(item.status)) {
        item.status = 'failed';
        item.error = item.invoiceId
          ? 'Reading stopped when the page was reloaded.'
          : 'This picture was not sent before the page was reloaded. Remove it and add it again.';
      }
      return item;
    });
}

// Can this failed invoice be tried again? It needs either its picture on the server, or the file
// still in the browser (which the caller knows about).
export const canRetry = (item, haveFile) =>
  item.status === 'failed' && !item.rejected && (Boolean(item.invoiceId) || haveFile);

// The result for one invoice (null when it has no amounts that can be counted).
export const itemNet = (item) => calculateNet({ debit: item.debit, credit: item.credit });

// What identifies the amounts of an invoice, to tell whether the history already has them.
export const amountsKey = (item) => JSON.stringify([item.debit, item.credit]);

// Does this invoice belong in the history right now (done, with an amount that can be counted)?
export const savable = (item) => item.status === 'done' && itemNet(item).ok;

// How the history is doing for the whole batch: { saving, failed, saved } counts of invoices.
export function historyStatus(items) {
  const counts = { saving: 0, failed: 0, saved: 0 };
  for (const item of items) {
    if (!savable(item)) continue;
    if (item.save === 'saving') counts.saving += 1;
    else if (item.failedKey === amountsKey(item)) counts.failed += 1;
    else if (item.savedKey === amountsKey(item)) counts.saved += 1;
    else counts.saving += 1; // waiting for its turn to be saved
  }
  return counts;
}

// How sure the reader was of one amount of an invoice ('high', 'low' or null), as on the review
// screen: it goes once the person changes the amount.
export const itemFlag = (item, field) =>
  item.read
    ? amountFlag({ ...item.read, [field]: item.read[field] ?? null }, field, item[field])
    : null;

// An invoice whose reading was doubtful: an amount flagged Low confidence, or a warning.
export const needsCheck = (item) =>
  item.status === 'done' &&
  item.read?.provider !== 'manual' &&
  (['debit', 'credit'].some((f) => itemFlag(item, f) === 'low') ||
    (item.read?.warnings?.length ?? 0) > 0);

// The combined total over everything that is done and has countable amounts, plus how many invoices
// are still on their way, failed, or have an amount that needs fixing.
export function summarize(items) {
  const done = items.filter((i) => i.status === 'done');
  const totals = calculateTotals(done.map((i) => ({ debit: i.debit, credit: i.credit })));
  const problems = new Map(); // item key -> reason it is not counted
  for (const s of totals.skipped) problems.set(done[s.index].key, s);
  return {
    totals,
    counted: totals.counted,
    pending: items.filter((i) => BUSY.has(i.status)).length,
    failed: items.filter((i) => i.status === 'failed').length,
    uncounted: totals.skipped.length,
    problems,
    total: items.length,
  };
}
