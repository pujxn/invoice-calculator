import { analysePass, judgeField } from './ocrParse.js';

// OCR is run several times over the same picture with different clean-up (see ocr.js). This file
// compares those readings and decides what, if anything, is safe to show in the Debit and Credit
// boxes. A box is only filled when at least two separate readings agree on the amount and it does
// not look like a rupee sign was read as a digit. Anything else is left empty with a reason,
// never guessed.

const FIELDS = ['debit', 'credit'];
const NAME = { debit: 'Debit', credit: 'Credit' };

function decideField(field, passes) {
  const judged = passes.map((p) => ({ pass: p, j: judgeField(p, field) }));
  const seen = judged.some(({ j }) => j.status !== 'absent');
  if (!seen) return { kind: 'absent' };

  // Trust only what several readings agree on. The rupee sign is the
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

// How much invoice-like structure a reading found: labels and amounts beside them.
// Used to tell which way up a picture is (the right way finds far more than the wrong ones).
export function evidence(wordLists) {
  return wordLists.reduce((total, words) => {
    const p = analysePass(words);
    return (
      total +
      Number(p.labels.debit) +
      Number(p.labels.credit) +
      2 * (p.totals.debit.length + p.totals.credit.length)
    );
  }, 0);
}

// True when two readings already agree on both amounts, so no further reading would add anything.
export function isSettled(wordLists) {
  const passes = wordLists.map(analysePass);
  return FIELDS.every((f) => decideField(f, passes).kind === 'agreed');
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
    };
  }

  const out = {};
  const notes = [];
  for (const field of FIELDS) {
    const d = decideField(field, passes);
    out[field] = d;
    const name = NAME[field];
    switch (d.kind) {
      case 'agreed':
        if (d.suspect) {
          notes.push(
            `The ${name} readings differed by a leading digit (a ₹ sign can look like one), so check its first digit especially.`,
          );
        }
        break;
      case 'suspect':
        notes.push(
          `The ${name} amount ${d.text} looks like it has an extra leading digit (a ₹ sign read as a digit), so it was left empty. Please type it.`,
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
    if (d.kind === 'agreed') return d.value;
    if (d.kind === 'unclear') return d.text; // passed on as printed so the app explains why
    return null;
  };
  const debit = value('debit');
  const credit = value('credit');
  // Two readings agreeing is good evidence but not proof, so OCR is never "high".
  const trusted = FIELDS.filter((f) => out[f].kind === 'agreed');
  const confidence = trusted.length > 0 ? 'medium' : 'low';

  const base =
    'Read with free OCR on the server (no AI). OCR can misread digits (the ₹ sign is often read as an extra digit in front), so check each amount against your picture.';
  return {
    readable: true,
    debit,
    credit,
    confidence,
    notes: [base, ...notes].join(' ').slice(0, 1900),
  };
}
