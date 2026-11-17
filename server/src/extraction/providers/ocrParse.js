import { parseAmount } from '../money.js';

// Turns the words an OCR engine found (text plus a box for each) into what Ledgerly needs:
// the printed Debit and Credit amounts. Nothing else is read from the picture.
//
// OCR is not reliable with digits, so this file is deliberately suspicious:
//  - the rupee sign is often read as a digit ("₹64,000.00" -> "364,000.00"), so an amount that
//    breaks the page's digit grouping is flagged as suspect instead of being used;
//  - an ambiguous number is never guessed (parseAmount refuses "1,234" and similar).
// Everything here is pure (no OCR, no I/O), so it is tested with recorded OCR output.

// ---------------------------------------------------------------- words, rows and labels

// Edit distance, for matching a label that OCR spelled slightly wrong ("Deb1t", "Credlt").
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = keep;
    }
  }
  return row[b.length];
}

const LABELS = { debit: 'debit', credit: 'credit' };
// Letters that OCR commonly swaps inside a word, folded together before comparing.
const fold = (s) =>
  s
    .toLowerCase()
    .replace(/[0]/g, 'o')
    .replace(/[1|!]/g, 'i')
    .replace(/[5$]/g, 's')
    .replace(/[^a-z]/g, '');

// "Debit:" / "Credit" / "Deb1t:" -> { field, rest } where rest is anything glued on after it
// ("Debit:₹500"). Returns null for any other word.
export function labelOf(text) {
  const t = String(text).trim();
  const m = /^([A-Za-z0-9|!$]{4,8})\s*[:=\-–—.;]*(.*)$/u.exec(t);
  if (!m) return null;
  const word = fold(m[1]);
  for (const [field, label] of Object.entries(LABELS)) {
    if (word === label || (word.length === label.length && distance(word, label) <= 1)) {
      return { field, rest: m[2] };
    }
  }
  return null;
}

const ok = (b) => b && [b.x0, b.y0, b.x1, b.y1].every(Number.isFinite) && b.x1 > b.x0;

// Flattens the engine's output into plain words with a centre and size.
export function toWords(raw) {
  return raw
    .filter((w) => w && typeof w.text === 'string' && w.text.trim() !== '' && ok(w.bbox))
    .map((w) => ({
      text: w.text.trim(),
      conf: Number.isFinite(w.confidence) ? w.confidence : 0,
      x0: w.bbox.x0,
      x1: w.bbox.x1,
      y0: w.bbox.y0,
      y1: w.bbox.y1,
      cx: (w.bbox.x0 + w.bbox.x1) / 2,
      cy: (w.bbox.y0 + w.bbox.y1) / 2,
      h: w.bbox.y1 - w.bbox.y0,
    }));
}

// Groups words that sit on the same visual line, left to right. Uses the words' own positions,
// not the engine's idea of a "line", because the engine often splits a label from its amount.
export function toRows(words) {
  const sorted = [...words].sort((a, b) => a.cy - b.cy);
  const rows = [];
  for (const w of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(w.cy - row.cy) <= 0.55 * Math.min(w.h, row.h)) {
      row.words.push(w);
      row.cy = row.words.reduce((t, x) => t + x.cy, 0) / row.words.length;
      row.h = Math.max(row.h, w.h);
    } else {
      rows.push({ words: [w], cy: w.cy, h: w.h });
    }
  }
  for (const row of rows) row.words.sort((a, b) => a.x0 - b.x0);
  return rows;
}

// ---------------------------------------------------------------- amounts

// Characters OCR gives for the rupee sign or for a stray mark in front of an amount.
const SYMBOL_ONLY = /^[₹¥£$€%©®?=~*#&:;'"`´.\-–—_()[\]{}<>«»]+$|^(?:rs|inr|rs\.|r\$)$/iu;
const LEADING_SYMBOL = /^(?:₹|rs\.?|inr|[¥£$€%©®?=~*#&:;'"`´_«»<>]|[TtZzFfEe](?=\d))+/iu;
// In a number, these letters are really digits (only applied inside something number-shaped).
const DIGIT_LOOKALIKE = {
  O: '0',
  o: '0',
  Q: '0',
  D: '0',
  l: '1',
  I: '1',
  '|': '1',
  S: '5',
  B: '8',
};

const isDigit = (ch) => ch >= '0' && ch <= '9';

// Reads one word as an amount. Returns null when it is not number-shaped, otherwise
// { text: "1,25,050.00", symbol: true when a currency mark was in front of it }.
export function amountFrom(text) {
  let t = String(text).normalize('NFKC').trim();
  let symbol = false;
  t = t.replace(/\s*\/[-=–—]\s*$/u, ''); // Rs 500/-  ->  500
  t = t.replace(/[,;:]+$/u, '');
  const lead = LEADING_SYMBOL.exec(t);
  if (lead) {
    symbol = true;
    t = t.slice(lead[0].length);
  }
  if (t === '' || /^[-–−(]/u.test(t)) return null; // empty, or negative: leave it to parseAmount via the caller

  // Only treat letters as digits when the word is mostly digits already ("1O,OOO.OO" yes, "Dental" no).
  const shaped = [...t].filter((c) => isDigit(c) || c === ',' || c === '.').length;
  const lookalikes = [...t].filter((c) => DIGIT_LOOKALIKE[c] !== undefined).length;
  if (shaped + lookalikes < t.length || shaped < 2) {
    if (!/^\d[\d.,]*$/.test(t)) return null;
  }
  t = [...t].map((c) => DIGIT_LOOKALIKE[c] ?? c).join('');
  if (!/^\d[\d.,]*\d$|^\d$/.test(t)) return null;
  const spaced = repairSeparators(t);
  return { text: groupingToPlain(spaced), symbol, grouping: groupingOf(spaced) };
}

// How the commas were placed: lakh ("2,48,025.00"), western with three-digit groups only
// ("291,500.00"), or none. Used to spot a total that breaks the style of the rest of the page.
function groupingOf(t) {
  if (/^\d{1,2}(?:,\d{2})+,\d{3}(?:\.\d+)?$/.test(t)) return 'lakh';
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(t)) return 'western';
  return 'none';
}

// Ledgerly is rupees only, and in India a comma only ever groups digits: "45,000" is forty-five
// thousand, never 45 and a bit. (The AI path keeps the stricter rule because a model may copy a
// European "1.234,5".) Standard (1,234,567) and lakh (12,34,567) grouping both lose their commas.
function groupingToPlain(t) {
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(t) || /^\d{1,2}(?:,\d{2})+,\d{3}(?:\.\d+)?$/.test(t)) {
    return t.replace(/,/g, '');
  }
  return t;
}

// OCR often turns a thousands comma into a full stop ("1.98,025.00"). When the amount ends in a
// two-digit fraction, every earlier separator is a grouping comma.
function repairSeparators(t) {
  const m = /^(\d[\d.,]*)[.,](\d{2})$/.exec(t);
  if (m && /[.,]/.test(m[1])) return `${m[1].replace(/\./g, ',')}.${m[2]}`;
  return t;
}

// ---------------------------------------------------------------- one OCR pass

const candidateFrom = (found, word, row) => {
  const parsed = parseAmount(found.text);
  return {
    text: found.text,
    value: parsed.ok ? parsed.value : null,
    reason: parsed.ok ? null : parsed.reason,
    message: parsed.ok ? null : parsed.message,
    symbol: found.symbol,
    grouping: found.grouping,
    conf: word.conf,
    cy: row.cy,
  };
};

// Looks along a row after a label for its amount. A lone currency mark between them is skipped.
function amountAfter(row, index, rest) {
  let symbol = false;
  const parts = [];
  if (rest) parts.push({ text: rest, word: row.words[index] });
  for (let j = index + 1; j < row.words.length; j++) {
    parts.push({ text: row.words[j].text, word: row.words[j] });
  }
  for (const part of parts) {
    if (SYMBOL_ONLY.test(part.text) || /^[:=\-–—]+$/.test(part.text)) {
      if (!/^[:=\-–—.]+$/.test(part.text)) symbol = true;
      continue;
    }
    const found = amountFrom(part.text);
    if (!found) return null; // a word that is not an amount: this label has no amount on its row
    return { found: { ...found, symbol: found.symbol || symbol }, word: part.word };
  }
  return null;
}

// Finds every Debit/Credit label that has an amount beside it, and notes labels with none
// (a column heading, or an amount OCR could not read).
function findLabels(rows) {
  const seen = { debit: false, credit: false };
  const totals = { debit: [], credit: [] };
  for (const row of rows) {
    row.words.forEach((word, i) => {
      const label = labelOf(word.text);
      if (!label) return;
      const hit = amountAfter(row, i, label.rest);
      if (hit) totals[label.field].push(candidateFrom(hit.found, hit.word, row));
      if (hit || !label.rest) seen[label.field] = true;
    });
  }
  return { seen, totals };
}

// Reads one OCR result. `totals[field]` lists every amount that appeared beside that label and
// `labels[field]` says whether the label was seen at all.
export function analysePass(rawWords) {
  const rows = toRows(toWords(rawWords));
  const { seen, totals } = findLabels(rows);
  // Does this page write its amounts the Indian way (12,34,567)? Then an amount with the same
  // size written the western way (291,500.00) is suspect: see judgeField.
  const lakhStyle = rows.some((row) =>
    row.words.some((w) => !labelOf(w.text) && amountFrom(w.text)?.grouping === 'lakh'),
  );
  return { labels: seen, totals, lakhStyle };
}

// ---------------------------------------------------------------- deciding what was printed

// What one pass says about one field:
//  { status: 'absent' }                         the label was not seen
//  { status: 'empty' }                          the label was seen, no readable amount beside it
//  { status: 'unchecked', value, conf, symbol } an amount was read (it counts once two readings agree)
//  { status: 'unclear', message, text }         a number we cannot read one way ("1,234")
//  { status: 'suspect', text }                  it breaks the page's digit grouping, so it may have a stray digit
//  { status: 'conflict' }                       two different amounts beside the same label
export function judgeField(pass, field) {
  if (!pass.labels[field]) return { status: 'absent' };
  const all = pass.totals[field];
  if (all.length === 0) return { status: 'empty' };

  const readable = all.filter((c) => c.value !== null);
  if (readable.length === 0) {
    return { status: 'unclear', text: all[0].text, message: all[0].message, reason: all[0].reason };
  }
  const values = [...new Set(readable.map((c) => c.value))];
  if (values.length > 1) return { status: 'conflict' };
  const best = readable[0];
  // A page that groups digits the Indian way, but an amount of a lakh or more grouped the western
  // way: "291,500.00" where "2,91,500.00" was expected. The classic sign of a ₹ read as a digit.
  const wholeDigits = best.value.split('.')[0].length;
  if (pass.lakhStyle && best.grouping === 'western' && wholeDigits >= 6) {
    return { status: 'suspect', text: best.text };
  }
  return { status: 'unchecked', value: best.value, conf: best.conf, symbol: best.symbol };
}
