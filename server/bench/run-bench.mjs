/* global process, console */
// Measures how well the free OCR reader does on a folder of pictures made by make-corpus.mjs:
//   node server/bench/run-bench.mjs <corpus-dir> [--json out.json]
// Each picture is graded per amount:
//   right   = the box holds the printed amount
//   empty   = the box was left empty (honest: the person types it)
//   WRONG   = the box holds a different number (the dangerous case)
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createExtractor } from '../src/extraction/index.js';
import { createOcrProvider } from '../src/extraction/providers/ocr.js';
import * as ocrDecide from '../src/extraction/providers/ocrDecide.js';

const { VOTES } = ocrDecide; // absent in older versions of the reader

const dir = path.resolve(process.argv[2] ?? 'corpus');
const jsonOut = process.argv.includes('--json')
  ? process.argv[process.argv.indexOf('--json') + 1]
  : null;
const only = process.argv.includes('--only')
  ? new RegExp(process.argv[process.argv.indexOf('--only') + 1])
  : null;
const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')).filter(
  (m) => !only || only.test(m.file),
);
const provider = createOcrProvider({ timeoutMs: 120_000 });
// Keeps the vote counts of the last reading (the extractor drops them from its answer).
let votes = null;
const extractor = createExtractor({
  provider: {
    ...provider,
    async extract(input) {
      const raw = await provider.extract(input);
      votes = (VOTES && raw[VOTES]) ?? null;
      return raw;
    },
  },
});

const rows = [];
for (const m of manifest) {
  const data = await readFile(path.join(dir, m.file));
  const started = Date.now();
  votes = null;
  let r;
  try {
    r = await extractor.extract({
      data,
      mimeType: m.file.endsWith('.png') ? 'image/png' : 'image/jpeg',
    });
  } catch (err) {
    r = { debit: null, credit: null, error: err.code ?? String(err) };
  }
  const grade = (got, want) => (got === want ? 'right' : got === null ? 'empty' : 'WRONG');
  const row = {
    ...m,
    gotDebit: r.debit,
    gotCredit: r.credit,
    flags: r.amountConfidence ?? null,
    confidence: r.confidence ?? null,
    votes,
    error: r.error ?? null,
    debitGrade: grade(r.debit, m.debit),
    creditGrade: grade(r.credit, m.credit),
    ms: Date.now() - started,
  };
  rows.push(row);
  console.log(
    `${row.debitGrade.padEnd(5)} ${row.creditGrade.padEnd(5)} ${String(row.ms).padStart(6)}ms  ${m.file}  ` +
      `${row.gotDebit ?? '-'} / ${row.gotCredit ?? '-'}  (want ${m.debit} / ${m.credit})${row.flags ? ' ' + JSON.stringify(row.flags) : ''}`,
  );
}
await provider.close();

const tally = (list) => {
  const n = list.length * 2;
  const c = { right: 0, empty: 0, WRONG: 0 };
  for (const r of list) {
    c[r.debitGrade]++;
    c[r.creditGrade]++;
  }
  const pct = (x) => `${((100 * x) / n).toFixed(0)}%`;
  const both = list.filter((r) => r.debitGrade === 'right' && r.creditGrade === 'right').length;
  return `amounts ${n}: right ${c.right} (${pct(c.right)}), empty ${c.empty} (${pct(c.empty)}), WRONG ${c.WRONG} (${pct(c.WRONG)}); pictures fully right ${both}/${list.length}; avg ${Math.round(list.reduce((t, r) => t + r.ms, 0) / list.length)}ms`;
};
console.log('\nALL          ', tally(rows));
for (const kind of ['printed', 'handwritten'])
  for (const photo of [false, true])
    console.log(
      `${kind} ${photo ? 'photo' : 'clean'}`.padEnd(18),
      tally(rows.filter((r) => r.kind === kind && r.photo === photo)),
    );
if (jsonOut) await writeFile(jsonOut, JSON.stringify(rows, null, 2));
