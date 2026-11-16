import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExtractionError } from '../src/extraction/errors.js';
import { createExtractor } from '../src/extraction/index.js';
import { createMockProvider } from '../src/extraction/providers/mock.js';
import { normalizeExtraction } from '../src/extraction/normalize.js';
import { validateModelOutput } from '../src/extraction/schema.js';

const good = (over = {}) => ({
  readable: true,
  debit: '1250.00',
  credit: '400.00',
  confidence: 'high',
  notes: '',
  line_items: [],
  ...over,
});

const rejects = (raw, pattern) =>
  assert.throws(
    () => validateModelOutput(raw),
    (err) => {
      assert.ok(err instanceof ExtractionError);
      assert.equal(err.code, 'bad_model_output');
      assert.equal(err.status, 502);
      assert.match(String(err.cause.message), pattern);
      return true;
    },
  );

test('a well formed model answer passes validation unchanged', () => {
  const out = validateModelOutput(
    good({
      notes: '  small print  ',
      line_items: [{ description: ' Parts ', column: 'debit', amount: '5.00' }],
    }),
  );
  assert.equal(out.notes, 'small print');
  assert.deepEqual(out.lineItems, [{ description: 'Parts', column: 'debit', amount: '5.00' }]);
  assert.equal(out.debit, '1250.00');
});

test('validation rejects anything that is not exactly the agreed shape', () => {
  rejects(null, /not an object/);
  rejects([], /not an object/);
  rejects('{"debit":"1"}', /not an object/);
  rejects({ ...good(), extra: 1 }, /unexpected field "extra"/);
  const noNotes = good();
  delete noNotes.notes;
  rejects(noNotes, /missing field "notes"/);
  rejects(good({ readable: 'yes' }), /readable/);
  rejects(good({ debit: 1250 }), /debit must be a string or null/);
  rejects(good({ credit: {} }), /credit/);
  rejects(good({ currency: 'INR' }), /unexpected field "currency"/); // rupees only: not asked for
  rejects(good({ confidence: 'certain' }), /confidence/);
  rejects(good({ notes: 5 }), /notes/);
  rejects(good({ line_items: 'none' }), /line_items must be a list/);
  rejects(good({ line_items: [null] }), /not an object/);
  rejects(good({ line_items: [{ description: 'a', column: 'net', amount: '1' }] }), /column/);
  rejects(good({ line_items: [{ description: 'a', column: 'debit', amount: 1 }] }), /amount/);
  rejects(good({ line_items: [{ description: 'a', column: 'debit' }] }), /missing field/);
  rejects(
    good({ line_items: [{ description: 'a', column: 'debit', amount: '1', tax: '2' }] }),
    /unexpected field/,
  );
  rejects(
    good({ line_items: Array(201).fill({ description: 'a', column: 'debit', amount: '1' }) }),
    /too many/,
  );
});

test('normalising turns text amounts into exact decimals', () => {
  const r = normalizeExtraction(validateModelOutput(good({ debit: '₹1,250.5', credit: '400' })));
  assert.equal(r.debit, '1250.50');
  assert.equal(r.credit, '400.00');
  assert.equal(r.currency, 'INR');
  assert.equal(r.confidence, 'high');
  assert.deepEqual(r.warnings, []);
  assert.equal(r.itemTotals, null);
});

test('a missing amount stays null (it is not turned into zero)', () => {
  const r = normalizeExtraction(validateModelOutput(good({ credit: null })));
  assert.equal(r.credit, null);
  assert.equal(r.debit, '1250.00');
  assert.deepEqual(r.warnings, []);
});

test('no amounts at all gives a null pair and a plain warning', () => {
  const r = normalizeExtraction(validateModelOutput(good({ debit: null, credit: null })));
  assert.equal(r.debit, null);
  assert.equal(r.credit, null);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.warnings[0].code, 'no_amounts');
});

test('an ambiguous amount becomes null with a warning and lowers confidence', () => {
  const r = normalizeExtraction(validateModelOutput(good({ debit: '1,234' })));
  assert.equal(r.debit, null);
  assert.equal(r.credit, '400.00');
  assert.equal(r.confidence, 'low');
  assert.deepEqual(
    r.warnings.map((w) => [w.field, w.code]),
    [['debit', 'ambiguous']],
  );
  assert.match(r.warnings[0].message, /1,234 or 1\.234/);
});

test('a plain number with extra decimals is kept exactly, not blanked', () => {
  const r = normalizeExtraction(validateModelOutput(good({ debit: '1234.567', credit: '0.001' })));
  assert.equal(r.debit, '1234.567');
  assert.equal(r.credit, '0.001');
  assert.deepEqual(r.warnings, []);
  assert.equal(r.confidence, 'high');
});

test('a 3-decimal amount that could be a thousands group is flagged Please check', () => {
  const r = normalizeExtraction(validateModelOutput(good({ debit: '12.345' })));
  assert.equal(r.debit, null);
  assert.equal(r.confidence, 'low');
  assert.deepEqual(
    r.warnings.map((w) => [w.field, w.code]),
    [['debit', 'ambiguous']],
  );
  assert.match(r.warnings[0].message, /12,345 or 12\.345/);
});

test('negative, over-long and garbage amounts are flagged, not passed on', () => {
  const r = normalizeExtraction(
    validateModelOutput(good({ debit: '-5.00', credit: '1.2345678901234' })),
  );
  assert.equal(r.debit, null);
  assert.equal(r.credit, null);
  assert.deepEqual(
    r.warnings.map((w) => w.code),
    ['negative', 'too_precise'],
  );
});

test('line items with extra decimals add up exactly and are checked against the totals', () => {
  const items = [
    { description: 'A', column: 'debit', amount: '0.001' },
    { description: 'B', column: 'debit', amount: '0.0004' },
  ];
  const ok = normalizeExtraction(
    validateModelOutput(good({ debit: '0.0014', credit: null, line_items: items })),
  );
  assert.deepEqual(ok.itemTotals, { debit: '0.0014', credit: '0.00' });
  assert.deepEqual(ok.warnings, []);
  const off = normalizeExtraction(
    validateModelOutput(good({ debit: '0.002', credit: null, line_items: items })),
  );
  assert.equal(off.warnings[0].code, 'items_mismatch');
});

test('line items are summed exactly and checked against the stated totals', () => {
  const items = [
    { description: 'A', column: 'debit', amount: '0.10' },
    { description: 'B', column: 'debit', amount: '0.20' },
    { description: 'C', column: 'credit', amount: '1,000.00' },
  ];
  const ok = normalizeExtraction(
    validateModelOutput(good({ debit: '0.30', credit: '1000.00', line_items: items })),
  );
  assert.deepEqual(ok.itemTotals, { debit: '0.30', credit: '1000.00' });
  assert.deepEqual(ok.warnings, []);
  assert.equal(ok.lineItems[2].amount, '1000.00');

  const off = normalizeExtraction(
    validateModelOutput(good({ debit: '0.31', credit: '1000.00', line_items: items })),
  );
  assert.equal(off.warnings.length, 1);
  assert.equal(off.warnings[0].code, 'items_mismatch');
  assert.equal(off.confidence, 'medium');
  assert.equal(off.debit, '0.31', 'the printed total is kept; the user decides');
});

test('lines without a usable amount are skipped with a warning', () => {
  const r = normalizeExtraction(
    validateModelOutput(
      good({
        debit: null,
        credit: null,
        line_items: [
          { description: 'Good', column: 'debit', amount: '10' },
          { description: 'Smudge', column: 'debit', amount: 'n/a' },
          { description: 'Odd', column: 'credit', amount: '1,234' },
        ],
      }),
    ),
  );
  assert.deepEqual(r.lineItems, [{ description: 'Good', column: 'debit', amount: '10.00' }]);
  assert.deepEqual(r.warnings.map((w) => w.code).sort(), ['ambiguous', 'invalid', 'total_missing']);
  assert.deepEqual(r.itemTotals, { debit: '10.00', credit: '0.00' });
});

test('the extractor reports an unreadable invoice as a 422', async () => {
  const extractor = createExtractor({
    provider: {
      name: 'fake',
      model: 'm',
      extract: async () => good({ readable: false, debit: null, credit: null }),
    },
    prepare: async (data) => ({ data, mediaType: 'image/jpeg' }),
  });
  await assert.rejects(extractor.extract({ data: Buffer.from('x'), mimeType: 'image/jpeg' }), {
    code: 'unreadable_invoice',
    status: 422,
  });
});

test('the extractor wraps unexpected provider failures and rejects bad output', async () => {
  const prepare = async (data) => ({ data, mediaType: 'image/jpeg' });
  const run = (extract) =>
    createExtractor({ provider: { name: 'fake', model: 'm', extract }, prepare }).extract({
      data: Buffer.from('x'),
      mimeType: 'image/jpeg',
    });
  await assert.rejects(
    run(async () => {
      throw new TypeError('boom');
    }),
    {
      code: 'provider_unavailable',
      status: 502,
    },
  );
  await assert.rejects(
    run(async () => ({ debit: '1' })),
    { code: 'bad_model_output' },
  );
  await assert.rejects(
    run(async () => {
      throw new ExtractionError('timeout', 'slow', { status: 504 });
    }),
    {
      code: 'timeout',
      status: 504,
    },
  );
});

test('the mock provider is deterministic, valid and self-consistent', async () => {
  const mock = createMockProvider();
  const a = await mock.extract({ fingerprint: Buffer.from('invoice one') });
  const again = await mock.extract({ fingerprint: Buffer.from('invoice one') });
  const b = await mock.extract({ fingerprint: Buffer.from('invoice two') });
  assert.deepEqual(a, again);
  assert.notDeepEqual(a, b);
  const r = normalizeExtraction(validateModelOutput(a));
  assert.deepEqual(r.warnings, [], 'its line items add up to its totals');
  assert.equal(r.debit, r.itemTotals.debit);
  assert.equal(r.credit, r.itemTotals.credit);
  assert.match(a.notes, /mock mode/i);
});
