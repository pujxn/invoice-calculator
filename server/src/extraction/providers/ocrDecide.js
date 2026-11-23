import { amountFrom, analysePass, judgeField } from './ocrParse.js';
import { parseAmount } from '../money.js';

// OCR is run several times over the same picture with different clean-up (see ocr.js), and then
// once more on just the spot where each amount was found ("close-up" readings, digits only).
// This file compares all of those and decides, for the Debit and Credit boxes:
//   - what to fill in: only an amount that at least two separate readings agree on, at least one
//     of them a reading of the whole page (a digits-only close-up alone can be forced into
//     digits, so it may confirm an amount but never invent one), at least one of them a close-up
//     when close-ups were taken, and that beats every other;
//   - how sure we are: "high" when the whole-page readings and the close-ups all agree and no
//     reading saw anything else, "low" (please double-check) otherwise.
// Anything else is left empty with a reason, never guessed.

const FIELDS = ['debit', 'credit'];
// The vote counts behind each decision, kept on the answer for the accuracy benchmark
// (server/bench). A symbol, so it never reaches the API response.
export const VOTES = Symbol('votes');
const NAME = { debit: 'Debit', credit: 'Credit' };

// Whole-page readings must agree this often, and close-ups this often, for "high".
export const HIGH = { pages: 2, closeUps: 2, minWordConfidence: 60 };

// A reading may be a plain word list (tests) or { words, scale } where scale is how much bigger
// that pass's picture was than the page; boxes are given back in page pixels.
const wordsOf = (r) => (Array.isArray(r) ? r : r.words);
const scaleOf = (r) => (Array.isArray(r) ? 1 : (r.scale ?? 1));

// What one close-up says: the amount, or null when it is not a readable number.
export function closeUpValue(text) {
  const t = String(text ?? '').replace(/\s+/g, '');
  const found = amountFrom(t);
  if (!found) return null;
  const parsed = parseAmount(found.text);
  return parsed.ok ? parsed.value : null;
}

function decideField(field, passes, closeUps = []) {
  const judged = passes.map((p) => judgeField(p, field));
  const seen = judged.some((j) => j.status !== 'absent');
  if (!seen) return { kind: 'absent' };

  const page = new Map();
  const conf = new Map();
  for (const j of judged.filter((x) => x.status === 'unchecked')) {
    page.set(j.value, (page.get(j.value) ?? 0) + 1);
    conf.set(j.value, Math.min(conf.get(j.value) ?? 100, j.conf));
  }
  const close = new Map();
  for (const c of closeUps) {
    const v = closeUpValue(c.text);
    if (v !== null) close.set(v, (close.get(v) ?? 0) + 1);
  }
  const score = (v) => (page.get(v) ?? 0) + (close.get(v) ?? 0);
  const everything = new Set([...page.keys(), ...close.keys()]);
  const ranked = [...page.keys()].sort((a, b) => score(b) - score(a));
  const top = ranked[0];
  // When close-ups of the amount were taken, at least one must agree with the page: on its own,
  // a whole-page reading of handwriting often drops or swaps a digit the same way twice.
  const confirmed = closeUps.length === 0 || (close.get(top) ?? 0) >= 1;
  if (top !== undefined && score(top) >= 2 && confirmed) {
    const rival = Math.max(0, ...[...everything].filter((v) => v !== top).map(score));
    if (score(top) > rival) {
      const high =
        everything.size === 1 &&
        (page.get(top) ?? 0) >= HIGH.pages &&
        (close.get(top) ?? 0) >= HIGH.closeUps &&
        conf.get(top) >= HIGH.minWordConfidence;
      return {
        kind: 'agreed',
        value: top,
        flag: high ? 'high' : 'low',
        votes: { pages: page.get(top) ?? 0, closeUps: close.get(top) ?? 0, others: rival },
      };
    }
    return { kind: 'conflict' };
  }

  const unclear = judged.find((j) => j.status === 'unclear');
  if (unclear) return { kind: 'unclear', text: unclear.text };
  if (page.size > 0) return { kind: 'unsure' };
  return { kind: 'empty' };
}

// How much invoice-like structure a reading found: labels and amounts beside them.
// Used to tell which way up a picture is (the right way finds far more than the wrong ones).
export function evidence(readings) {
  return readings.reduce((total, r) => {
    const p = analysePass(wordsOf(r));
    return (
      total +
      Number(p.labels.debit) +
      Number(p.labels.credit) +
      2 * (p.totals.debit.length + p.totals.credit.length)
    );
  }, 0);
}

// True when two readings already agree on both amounts, so no further whole-page reading would
// add anything (close-ups still follow).
export function isSettled(readings) {
  const passes = readings.map((r) => analysePass(wordsOf(r)));
  return FIELDS.every((f) => decideField(f, passes).kind === 'agreed');
}

// Where on the page each amount was printed, so ocr.js can take a close-up of it: the box of the
// best-supported reading, in page pixels. Fields with no amount found get no box.
export function amountBoxes(readings) {
  const boxes = {};
  const passes = readings.map((r) => ({ pass: analysePass(wordsOf(r)), scale: scaleOf(r) }));
  for (const field of FIELDS) {
    const found = passes
      .map(({ pass, scale }) => ({ j: judgeField(pass, field), scale }))
      .filter(({ j }) => (j.status === 'unchecked' || j.status === 'unclear') && j.box);
    if (found.length === 0) continue;
    const counts = new Map();
    for (const { j } of found)
      counts.set(j.value ?? j.text, (counts.get(j.value ?? j.text) ?? 0) + 1);
    const best = found.reduce((a, b) =>
      counts.get(b.j.value ?? b.j.text) > counts.get(a.j.value ?? a.j.text) ? b : a,
    );
    const { box } = best.j;
    boxes[field] = {
      x0: box.x0 / best.scale,
      y0: box.y0 / best.scale,
      x1: box.x1 / best.scale,
      y1: box.y1 / best.scale,
      minX: box.minX === null || box.minX === undefined ? null : box.minX / best.scale,
    };
  }
  return boxes;
}

// `readings` are the whole-page OCR results; `closeUps[field]` the digits-only re-reads of each
// amount ([{ text }]). Returns the same shape the Claude provider returns, plus `amountConfidence`
// ({ debit, credit }: 'high', 'low' or null for an empty box), so the rest of the app needs no
// special case.
export function decide(readings, closeUps = {}) {
  const passes = readings.map((r) => analysePass(wordsOf(r)));
  const seenAnything = passes.some((p) => p.labels.debit || p.labels.credit);
  if (!seenAnything) {
    return {
      readable: false,
      debit: null,
      credit: null,
      confidence: 'low',
      amountConfidence: { debit: null, credit: null },
      notes: '',
    };
  }

  const out = {};
  const notes = [];
  for (const field of FIELDS) {
    const d = decideField(field, passes, closeUps[field] ?? []);
    out[field] = d;
    const name = NAME[field];
    switch (d.kind) {
      case 'agreed':
        if (d.flag === 'low')
          notes.push(`Double-check the ${name} amount: the readings did not all agree.`);
        break;
      case 'unclear':
        notes.push(`The ${name} amount ${d.text} could be read two ways.`);
        break;
      case 'absent':
        notes.push(`No ${name} label was found in the picture.`);
        break;
      default:
        notes.push(`The ${name} amount could not be read reliably, so it was left empty.`);
    }
  }

  const value = (f) => {
    const d = out[f];
    if (d.kind === 'agreed') return d.value;
    if (d.kind === 'unclear') return d.text; // passed on as printed so the app explains why
    return null;
  };
  const amountConfidence = {};
  for (const f of FIELDS) amountConfidence[f] = out[f].kind === 'agreed' ? out[f].flag : null;

  const flags = Object.values(amountConfidence).filter(Boolean);
  const confidence =
    flags.length === 0 ? 'low' : flags.every((f) => f === 'high') ? 'high' : 'medium';

  const base =
    'Read with free OCR on the server (no AI). OCR can misread digits, so check each amount against your picture.';
  return {
    readable: true,
    debit: value('debit'),
    credit: value('credit'),
    confidence,
    amountConfidence,
    notes: [base, ...notes].join(' ').slice(0, 1900),
    [VOTES]: { debit: out.debit.votes ?? null, credit: out.credit.votes ?? null },
  };
}
