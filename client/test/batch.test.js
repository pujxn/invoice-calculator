import { describe, expect, it } from 'vitest';
import {
  MAX_BATCH,
  admit,
  admitNote,
  canRetry,
  makeItem,
  restore,
  summarize,
} from '../src/invoices/batch.js';

const file = (name, size = 100, lastModified = 1) => {
  const f = new File(['x'], name, { type: 'image/jpeg', lastModified });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const done = (debit, credit, over = {}) => ({
  ...makeItem(file(`${debit}-${credit}.jpg`)),
  status: 'done',
  debit,
  credit,
  ...over,
});

describe('makeItem', () => {
  it('starts a usable picture queued', () => {
    const item = makeItem(file('a.jpg'));
    expect(item).toMatchObject({
      name: 'a.jpg',
      status: 'queued',
      rejected: false,
      invoiceId: null,
    });
  });

  it('starts a file that is not a picture as failed, with the reason, and not retryable', () => {
    const item = makeItem(new File(['x'], 'notes.pdf', { type: 'application/pdf' }));
    expect(item.status).toBe('failed');
    expect(item.error).toMatch(/not a JPEG, PNG, WebP or HEIC/);
    expect(canRetry(item, true)).toBe(false);
  });
});

describe('admit', () => {
  it('skips a file already in the batch, so it is never counted twice', () => {
    const existing = [makeItem(file('a.jpg', 100, 5))];
    const { fresh, duplicates } = admit(existing, [file('a.jpg', 100, 5), file('a.jpg', 200, 5)]);
    expect(duplicates).toBe(1);
    expect(fresh).toHaveLength(1);
  });

  it('skips a repeat inside the same selection', () => {
    const { fresh, duplicates } = admit([], [file('a.jpg'), file('a.jpg'), file('b.jpg')]);
    expect([fresh.length, duplicates]).toEqual([2, 1]);
  });

  it(`takes at most ${MAX_BATCH} invoices`, () => {
    const many = Array.from({ length: MAX_BATCH + 3 }, (_, i) => file(`f${i}.jpg`));
    const { fresh, overflow } = admit([], many);
    expect([fresh.length, overflow]).toEqual([MAX_BATCH, 3]);
  });

  it('words what was left out', () => {
    expect(admitNote({ duplicates: 0, overflow: 0 })).toBe('');
    expect(admitNote({ duplicates: 1, overflow: 0 })).toMatch(/1 file was already in the list/);
    expect(admitNote({ duplicates: 2, overflow: 1 })).toMatch(
      /2 files were already.*1 file was not added/,
    );
  });
});

describe('restore', () => {
  it('shows a picture that was not sent yet as failed, and one being read as retryable', () => {
    const saved = [
      { ...makeItem(file('a.jpg')), status: 'queued' },
      { ...makeItem(file('b.jpg')), status: 'reading', invoiceId: 'x'.repeat(32) },
      { ...makeItem(file('c.jpg')), status: 'done', debit: '5.00', credit: '' },
    ];
    const [queued, reading, ok] = restore(JSON.parse(JSON.stringify(saved)));
    expect(queued.status).toBe('failed');
    expect(canRetry(queued, false)).toBe(false);
    expect(reading.status).toBe('failed');
    expect(canRetry(reading, false)).toBe(true);
    expect(ok).toMatchObject({ status: 'done', debit: '5.00' });
  });

  it('ignores junk', () => {
    expect(restore(null)).toEqual([]);
    expect(restore([null, { key: 3 }, 'x'])).toEqual([]);
  });
});

describe('summarize', () => {
  it('adds up only the invoices that are done, and counts the rest', () => {
    const items = [
      done('1,250.00', '400.00'),
      done('300', '975.50'),
      { ...makeItem(file('slow.jpg')), status: 'reading' },
      { ...makeItem(file('bad.jpg')), status: 'failed', error: 'no' },
      done('abc', ''),
      done('', ''),
    ];
    const s = summarize(items);
    expect(s.counted).toBe(2);
    expect(s.pending).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.uncounted).toBe(2);
    expect(s.total).toBe(6);
    expect(s.totals).toMatchObject({
      ok: true,
      debit: '1550.00',
      credit: '1375.50',
      net: '174.50',
    });
    expect(s.problems.get(items[4].key).reason).toBe('invalid');
    expect(s.problems.get(items[5].key).reason).toBe('nothing');
  });

  it('has no total until something is counted', () => {
    expect(summarize([]).totals.ok).toBe(false);
    expect(summarize([{ ...makeItem(file('a.jpg')), status: 'queued' }]).totals.ok).toBe(false);
  });
});
