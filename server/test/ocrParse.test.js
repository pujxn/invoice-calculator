import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amountFrom,
  analysePass,
  judgeField,
  labelOf,
  toRows,
  toWords,
} from '../src/extraction/providers/ocrParse.js';
import { decide, isSettled } from '../src/extraction/providers/ocrDecide.js';

// Builds OCR words the way the engine reports them: text, confidence and a box.
const word = (text, x0, y, width = text.length * 20, conf = 95) => ({
  text,
  confidence: conf,
  bbox: { x0, y0: y - 15, x1: x0 + width, y1: y + 15 },
});

// A typical invoice: headings, three lines and two totals (right edges line up like a real table).
function invoice({ debitTotal = '₹1,25,050.00', creditTotal = '₹40,000.00', skip = [] } = {}) {
  const words = [
    word('Description', 40, 100),
    word('Debit', 520, 100, 100),
    word('Credit', 700, 100, 120),
    word('Kitchen rewiring', 40, 160),
    word('90,050.00', 460, 160, 160),
    word('Materials', 40, 220),
    word('35,000.00', 460, 220, 160),
    word('Deposit received', 40, 280),
    word('40,000.00', 660, 280, 160),
    word('Debit:', 40, 400, 120),
    word(debitTotal, 560, 400, 260),
    word('Credit:', 40, 460, 130),
    word(creditTotal, 560, 460, 260),
  ];
  return words.filter((w) => !skip.includes(w.text));
}

test('labels are matched loosely but only for Debit and Credit', () => {
  assert.equal(labelOf('Debit:').field, 'debit');
  assert.equal(labelOf('DEBIT').field, 'debit');
  assert.equal(labelOf('Deb1t:').field, 'debit');
  assert.equal(labelOf('Credit').field, 'credit');
  assert.equal(labelOf('Cred1t:').field, 'credit');
  assert.equal(labelOf('Credlt').field, 'credit');
  assert.equal(labelOf('Debit:₹500').rest, '₹500');
  for (const other of ['Description', 'Delivery', 'Debt', 'Credits', 'Deposit', 'Dental', '']) {
    assert.equal(labelOf(other), null, other);
  }
});

test('amounts: rupee marks, commas, lakh grouping, /- and OCR letters inside numbers', () => {
  const cases = [
    ['₹1,25,050.00', '125050.00', true],
    ['Rs.45,000/-', '45000', true],
    ['64,000.00', '64000.00', false],
    ['1,234', '1234', false], // a comma only groups digits in rupees
    ['12,34,567', '1234567', false],
    ['1,234,567.5', '1234567.5', false],
    ['1O,OOO.OO', '10000.00', false], // letter O inside a number
    ['l,250.5S', '1250.55', false], // l is 1 and S is 5
    ['1.98,025.00', '198025.00', false], // a full stop where the comma should be
    ['¥2,48,025.00', '248025.00', true],
    ['%1,25,050.00', '125050.00', true],
    ['0.001', '0.001', false],
    ['12.345', '12.345', false],
  ];
  for (const [text, plain, symbol] of cases) {
    const a = amountFrom(text);
    assert.ok(a, text);
    assert.equal(a.text.replace(/,/g, ''), plain.replace(/,/g, ''), text);
    assert.equal(a.symbol, symbol, `${text} symbol`);
  }
  for (const text of [
    'Dental',
    'Harbour',
    'Nov',
    '2026-0142x',
    'hours',
    'abc',
    '--',
    '-500',
    ',',
  ]) {
    assert.equal(amountFrom(text), null, text);
  }
  // Letters are only digits when the word is number-shaped: a name must not become an amount.
  assert.equal(amountFrom('SOS'), null);
  assert.equal(amountFrom('Bill'), null);
});

test('words on the same line are grouped even when the engine split them', () => {
  const rows = toRows(toWords(invoice()));
  const labels = rows.map((r) => r.words.map((w) => w.text).join(' '));
  assert.ok(labels.includes('Debit: ₹1,25,050.00'));
  assert.ok(labels.includes('Credit: ₹40,000.00'));
  assert.ok(labels.includes('Kitchen rewiring 90,050.00'));
});

test('a clean invoice: the printed totals are read and the table lines are ignored', () => {
  const pass = analysePass(invoice());
  assert.deepEqual(pass.labels, { debit: true, credit: true });
  assert.equal('items' in pass, false, 'lines of the table are not read at all');
  assert.equal(judgeField(pass, 'debit').value, '125050.00');
  assert.equal(judgeField(pass, 'credit').value, '40000.00');
  // One reading is never enough, two that agree are.
  assert.equal(isSettled([invoice()]), false);
  assert.equal(isSettled([invoice(), invoice()]), true);
  const out = decide([invoice(), invoice()]);
  assert.deepEqual([out.debit, out.credit, out.confidence], ['125050.00', '40000.00', 'medium']);
  assert.equal('line_items' in out, false);
});

test('a total that does not match the table below it is still the printed total', () => {
  // Nothing adds up the lines any more, so the printed Debit total is what counts.
  const words = invoice({ debitTotal: '₹1,25,060.00' });
  const out = decide([words, words]);
  assert.deepEqual([out.debit, out.credit], ['125060.00', '40000.00']);
});

test('one reading is never trusted; two agreeing readings are, at medium', () => {
  const note = (debit) => [
    word('Debit:', 40, 100, 120),
    word(debit, 300, 100, 220),
    word('Credit:', 40, 160, 130),
    word('₹3,200.00', 300, 160, 220),
  ];
  const single = decide([note('₹12,500.50')]);
  assert.deepEqual([single.debit, single.credit, single.confidence], [null, null, 'low']);
  const two = decide([note('₹12,500.50'), note('₹12,500.50')]);
  assert.deepEqual([two.debit, two.credit, two.confidence], ['12500.50', '3200.00', 'medium']);
  assert.match(two.notes, /check each amount against your picture/);
  // disagreeing readings: nothing is guessed
  const split = decide([note('₹12,500.50'), note('₹12,900.50')]);
  assert.equal(split.debit, null);
  // a leading-digit difference (₹ read as 7) counts for the shorter number, and says so
  const prefixed = decide([note('712,500.50'), note('12,500.50'), note('12,500.50')]);
  assert.equal(prefixed.debit, '12500.50');
  const tie = decide([note('712,500.50'), note('12,500.50')]);
  assert.equal(tie.debit, '12500.50');
  assert.match(tie.notes, /differed by a leading digit/);
  // but a clear majority for the longer number is believed
  const majority = decide([note('3,200.00'), note('3,200.00'), note('200.00')]);
  assert.equal(majority.debit, '3200.00');
});

test('an ambiguous number is passed on as printed so the app can ask, never guessed', () => {
  const words = [
    word('Debit:', 40, 100, 120),
    word('12.345', 300, 100, 140),
    word('Credit:', 40, 160, 130),
  ];
  const out = decide([words]);
  assert.equal(out.debit, '12.345'); // the app's own parser flags this
  assert.equal(out.credit, null);
});

test('only Debit present: the other box stays empty and the notes say so', () => {
  const words = [word('Debit:', 40, 100, 120), word('₹500.00', 300, 100, 160)];
  const out = decide([words, words]);
  assert.equal(out.debit, '500.00');
  assert.equal(out.credit, null);
  assert.equal(out.confidence, 'medium');
  assert.match(out.notes, /No Credit label/);
});

test('no Debit or Credit label anywhere means this is not a readable invoice', () => {
  const words = [word('Meeting', 40, 100), word('notes', 300, 100), word('12,000.00', 300, 160)];
  assert.equal(decide([words]).readable, false);
  assert.equal(decide([[]]).readable, false);
});

test('the same words in a different order, or with junk words around, still read the same', () => {
  const words = invoice();
  const junk = [word('|', 5, 50, 10, 5), word('~~', 900, 300, 30, 3), word('2026', 40, 30, 80)];
  const shuffled = [...junk, ...[...words].reverse()];
  const out = decide([shuffled, junk.concat(words)]);
  assert.deepEqual([out.debit, out.credit], ['125050.00', '40000.00']);
});

test('boxes missing or malformed in the engine output are ignored, not fatal', () => {
  const bad = [
    { text: 'Debit:' },
    { text: '', bbox: { x0: 0, y0: 0, x1: 5, y1: 5 } },
    null,
    ...invoice(),
  ];
  assert.equal(decide([bad, bad]).debit, '125050.00');
});

test('a lakh-style page with a western-style six-digit total is not trusted', () => {
  // The page writes 2,48,025.00 (lakh style), so 291,500.00 for the total looks like ₹91,500
  // with the rupee sign read as a 2, so the box stays empty.
  const page = (total) => [
    word('Debit:', 40, 100, 120),
    word('₹2,48,025.00', 300, 100, 240),
    word('Credit:', 40, 160, 130),
    word(total, 300, 160, 220),
  ];
  const out = decide([page('291,500.00'), page('291,500.00')]);
  assert.equal(out.credit, null);
  assert.equal(out.debit, '248025.00');
  assert.match(out.notes, /extra leading digit/);
  // The same total written the Indian way, or a smaller one, is fine.
  assert.equal(decide([page('2,91,500.00'), page('2,91,500.00')]).credit, '291500.00');
  assert.equal(decide([page('91,500.00'), page('91,500.00')]).credit, '91500.00');
  // A page in western style throughout is not second-guessed.
  const western = (total) => [
    word('Debit:', 40, 100, 120),
    word('248,025.00', 300, 100, 240),
    word('Credit:', 40, 160, 130),
    word(total, 300, 160, 220),
  ];
  assert.equal(decide([western('291,500.00'), western('291,500.00')]).credit, '291500.00');
});
