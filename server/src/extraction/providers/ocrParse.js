import { parseAmount, sameAmount, sumAmounts } from '../money.js';

// Turns the words an OCR engine found (text plus a box for each) into what Ledgerly needs:
// the printed Debit and Credit totals, and the lines of the Debit and Credit columns.
//
// OCR is not reliable with digits, so this file is deliberately suspicious:
//  - a total is only "verified" when it equals the sum of the lines in its column;
//  - the rupee sign is often read as a digit ("₹64,000.00" -> "364,000.00"), so a total that
//    does not match its lines is retried without its first character, and a total with no lines
//    to check against is never reported as verified;
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

// Finds every Debit/Credit label and sorts them into
//   headers  (a column heading: no amount beside it) and
//   totals   (a label with an amount beside it).
function findLabels(rows) {
  const headers = { debit: [], credit: [] };
  const totals = { debit: [], credit: [] };
  rows.forEach((row, r) => {
    row.words.forEach((word, i) => {
      const label = labelOf(word.text);
      if (!label) return;
      const hit = amountAfter(row, i, label.rest);
      if (hit) totals[label.field].push(candidateFrom(hit.found, hit.word, row));
      else if (!label.rest) headers[label.field].push({ ...word, row: r });
    });
  });
  return { headers, totals };
}

// How far apart two edges may be and still count as the same column.
const alignment = (word, head) =>
  Math.min(Math.abs(word.x1 - head.x1), Math.abs(word.cx - head.cx), Math.abs(word.x0 - head.x0));

// The lines of the table: every amount sitting under the Debit or Credit heading.
function findItems(rows, headers, totals) {
  const head = {};
  for (const field of ['debit', 'credit']) {
    // The heading is the highest label with no amount beside it.
    head[field] = headers[field].sort((a, b) => a.cy - b.cy)[0] ?? null;
  }
  const columns = Object.entries(head).filter(([, h]) => h);
  if (columns.length === 0) return [];
  const top = Math.max(...columns.map(([, h]) => h.cy));
  const totalsTop = Math.min(
    ...['debit', 'credit'].flatMap((f) => totals[f].map((c) => c.cy)),
    Infinity,
  );

  const items = [];
  for (const row of rows) {
    if (row.cy <= top + 0.5 * row.h || row.cy >= totalsTop - 0.5 * row.h) continue;
    for (const [i, word] of row.words.entries()) {
      if (labelOf(word.text)) continue;
      const found = amountFrom(word.text);
      if (!found) continue;
      const scored = columns
        .map(([field, h]) => ({
          field,
          gap: alignment(word, h),
          tolerance: 0.6 * Math.max(word.x1 - word.x0, h.x1 - h.x0),
        }))
        .filter((c) => c.gap <= c.tolerance)
        .sort((a, b) => a.gap - b.gap);
      if (scored.length === 0) continue;
      if (scored[1] && scored[1].gap - scored[0].gap < 0.05 * (word.x1 - word.x0)) continue; // cannot tell which column
      const parsed = parseAmount(found.text);
      if (!parsed.ok || parsed.value === null) continue;
      const description = row.words
        .slice(0, i)
        .map((w) => w.text)
        .join(' ')
        .replace(/[|_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      items.push({
        description: description || 'Line',
        column: scored[0].field,
        amount: parsed.value,
      });
    }
  }
  return items;
}

// Reads one OCR result. `totals[field]` lists every amount that appeared beside that label,
// `labels[field]` says whether the label was seen at all, and `items` are the table lines.
export function analysePass(rawWords) {
  const rows = toRows(toWords(rawWords));
  const { headers, totals } = findLabels(rows);
  const items = findItems(rows, headers, totals);
  // Does this page write its amounts the Indian way (12,34,567)? Then a total with the same
  // size written the western way (291,500.00) is suspect: see judgeField.
  const lakhStyle = rows.some((row) =>
    row.words.some((w) => !labelOf(w.text) && amountFrom(w.text)?.grouping === 'lakh'),
  );
  const labels = {
    debit: headers.debit.length + totals.debit.length > 0,
    credit: headers.credit.length + totals.credit.length > 0,
  };
  return { labels, totals, items, lakhStyle };
}

// ---------------------------------------------------------------- deciding what was printed

// First digit removed ("364,000.00" -> "64,000.00"): the usual way a rupee sign is misread.
function withoutFirstDigit(text) {
  const plain = text.replace(/^\d/, '');
  if (plain === text || !/^[\d]/.test(plain.replace(/^,/, ''))) return null;
  const parsed = parseAmount(plain.replace(/^,/, ''));
  return parsed.ok && parsed.value !== null ? parsed.value : null;
}

// What one pass says about one field:
//  { status: 'absent' }                         the label was not seen
//  { status: 'empty' }                          the label was seen, no readable amount beside it
//  { status: 'verified', value, repaired }      equals the sum of its lines (maybe after dropping a misread first digit)
//  { status: 'mismatch', text, sum }            does not equal its lines and could not be repaired
//  { status: 'unchecked', value, conf, symbol } no lines to check against
//  { status: 'unclear', message, text }         a number we cannot read one way ("1,234")
//  { status: 'suspect', text }                  no lines to check, and it breaks the page's grouping style
//  { status: 'conflict' }                       two different amounts beside the same label
export function judgeField(pass, field) {
  if (!pass.labels[field]) return { status: 'absent' };
  const lines = pass.items.filter((i) => i.column === field).map((i) => i.amount);
  const sum = lines.length > 0 ? sumAmounts(lines) : null;
  const all = pass.totals[field];
  if (all.length === 0) return { status: 'empty', sum };

  const readable = all.filter((c) => c.value !== null);
  if (readable.length === 0) {
    return { status: 'unclear', text: all[0].text, message: all[0].message, reason: all[0].reason };
  }
  if (sum !== null) {
    for (const c of readable) {
      if (sameAmount(c.value, sum)) return { status: 'verified', value: c.value, repaired: false };
    }
    for (const c of readable) {
      const repaired = withoutFirstDigit(c.text);
      if (repaired !== null && sameAmount(repaired, sum)) {
        return { status: 'verified', value: repaired, repaired: true, was: c.text };
      }
    }
    return { status: 'mismatch', text: readable[0].text, sum };
  }
  const values = [...new Set(readable.map((c) => c.value))];
  if (values.length > 1) return { status: 'conflict' };
  const best = readable[0];
  // A page that groups digits the Indian way, but a total of a lakh or more grouped the western
  // way: "291,500.00" where "2,91,500.00" was expected. The classic sign of a ₹ read as a digit.
  const wholeDigits = best.value.split('.')[0].length;
  if (pass.lakhStyle && best.grouping === 'western' && wholeDigits >= 6) {
    return { status: 'suspect', text: best.text };
  }
  return { status: 'unchecked', value: best.value, conf: best.conf, symbol: best.symbol };
}
