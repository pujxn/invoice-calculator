import { analysePass, judgeField } from './ocrParse.js';

// OCR is run several times over the same picture with different clean-up (see ocr.js). This file
// compares those readings and decides what, if anything, is safe to show in the Debit and Credit
// boxes. A box is only filled when:
//   - the total equals the sum of the lines in its column (verified), or
//   - at least two separate readings agree on it and every digit was read with good confidence
//     (agreed, medium confidence, and the user is told it was not cross-checked).
// Anything else is left empty with a reason, never guessed.

const FIELDS = ['debit', 'credit'];
const NAME = { debit: 'Debit', credit: 'Credit' };

const mostCommon = (values) => {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  if (ranked[1] && ranked[1][1] === ranked[0][1]) return null; // a tie: no clear winner
  return ranked[0][0];
};

function decideField(field, passes) {
  const judged = passes.map((p) => ({ pass: p, j: judgeField(p, field) }));
  const seen = judged.some(({ j }) => j.status !== 'absent');
  if (!seen) return { kind: 'absent' };

  const verified = judged.filter(({ j }) => j.status === 'verified');
  if (verified.length > 0) {
    const value = mostCommon(verified.map(({ j }) => j.value));
    if (value === null) return { kind: 'conflict' };
    const pick = verified.find(({ j }) => j.value === value);
    return {
      kind: 'verified',
      value,
      pass: pick.pass,
      repaired: pick.j.repaired ? pick.j.was : null,
    };
  }

  const mismatch = judged.find(({ j }) => j.status === 'mismatch');
  if (mismatch) return { kind: 'mismatch', text: mismatch.j.text, sum: mismatch.j.sum };

  // No lines to check against: trust only what several readings agree on. The rupee sign is the
  // usual culprit when they differ ("12,500.50" read as "712,500.50"), so when one reading is
  // the other with a digit in front, the two count as one vote for the shorter number.
  const unchecked = judged.filter(({ j }) => j.status === 'unchecked');
  const votes = new Map();
  for (const { j } of unchecked) votes.set(j.value, (votes.get(j.value) ?? 0) + 1);
  let suspect = false;
  for (const [longer, count] of [...votes]) {
    const shorter = longer.slice(1);
    if (votes.has(shorter) && votes.get(shorter) >= count) {
      votes.set(shorter, votes.get(shorter) + count); // not outvoted: the shorter number wins
      votes.delete(longer);
      suspect = true;
    }
  }
  const ranked = [...votes].sort((a, b) => b[1] - a[1]);
  if (ranked.length > 0 && ranked[0][1] >= 2 && (!ranked[1] || ranked[1][1] < ranked[0][1])) {
    return { kind: 'agreed', value: ranked[0][0], suspect };
  }
  if (ranked.length > 1 && ranked[0][1] >= 2) return { kind: 'conflict' };

  const looksWrong = judged.find(({ j }) => j.status === 'suspect');
  if (looksWrong) return { kind: 'suspect', text: looksWrong.j.text };

  const unclear = judged.find(({ j }) => j.status === 'unclear');
  if (unclear) return { kind: 'unclear', text: unclear.j.text };
  if (unchecked.length > 0) return { kind: 'unsure' };
  return { kind: 'empty' };
}

// How much invoice-like structure a reading found: labels, amounts beside them, table lines.
// Used to tell which way up a picture is (the right way finds far more than the wrong ones).
export function evidence(wordLists) {
  return wordLists.reduce((total, words) => {
    const p = analysePass(words);
    return (
      total +
      Number(p.labels.debit) +
      Number(p.labels.credit) +
      2 * (p.totals.debit.length + p.totals.credit.length) +
      p.items.length
    );
  }, 0);
}

// True when both totals are verified, so no further reading of the picture would add anything.
export function isSettled(wordLists) {
  const passes = wordLists.map(analysePass);
  return FIELDS.every((f) => decideField(f, passes).kind === 'verified');
}

// `passes` are the word lists from each OCR run. Returns the same shape the Claude provider
// returns, so the rest of the app needs no special case.
export function decide(wordLists) {
  const passes = wordLists.map(analysePass);
  const seenAnything = passes.some((p) => p.labels.debit || p.labels.credit);
  if (!seenAnything) {
    return {
      readable: false,
      debit: null,
      credit: null,
      confidence: 'low',
      notes: '',
      line_items: [],
    };
  }

  const out = {};
  const notes = [];
  for (const field of FIELDS) {
    const d = decideField(field, passes);
    out[field] = d;
    const name = NAME[field];
    switch (d.kind) {
      case 'verified':
        if (d.repaired) {
          notes.push(
            `The ₹ sign was read as a digit in "${d.repaired}" (${name}); used ${d.value}, which matches the lines.`,
          );
        }
        break;
      case 'agreed':
        notes.push(
          `The ${name} total could not be checked against any lines${
            d.suspect
              ? ' and the readings differed by a leading digit (a ₹ sign can look like one)'
              : ''
          }, so check its first digit especially.`,
        );
        break;
      case 'mismatch':
        notes.push(
          `The ${name} total was read as ${d.text} but its lines add up to ${d.sum}, so it was left empty. Please type it.`,
        );
        break;
      case 'suspect':
        notes.push(
          `The ${name} total ${d.text} looks like it has an extra leading digit (a ₹ sign read as a digit) and has no lines to prove it, so it was left empty. Please type it.`,
        );
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
    if (d.kind === 'verified' || d.kind === 'agreed') return d.value;
    if (d.kind === 'unclear') return d.text; // passed on as printed so the app explains why
    return null;
  };
  const debit = value('debit');
  const credit = value('credit');
  const trusted = FIELDS.filter((f) => ['verified', 'agreed'].includes(out[f].kind));
  let confidence = 'low';
  if (trusted.length > 0) confidence = 'medium';
  if (trusted.length === 2 && trusted.every((f) => out[f].kind === 'verified')) confidence = 'high';

  // The table lines come from a reading whose totals they proved, else the fullest reading.
  const proof = FIELDS.map((f) => out[f].pass).find(Boolean);
  const fullest = [...passes].sort((a, b) => b.items.length - a.items.length)[0];
  const source = proof ?? fullest;
  const lineItems = source.items.map((i) => ({
    description: i.description,
    column: i.column,
    amount: i.amount,
  }));

  const base =
    'Read with free OCR on the server (no AI). OCR can misread digits, so check each amount against your picture.';
  return {
    readable: true,
    debit,
    credit,
    confidence,
    notes: [base, ...notes].join(' ').slice(0, 1900),
    line_items: lineItems.slice(0, 200),
  };
}
