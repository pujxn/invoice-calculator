/* global process, console, document */
// Draws a test set of invoice pictures for measuring the free OCR reader:
//   FONT_DIR=<folder with the @fontsource woff2 files> node server/bench/make-corpus.mjs <out-dir>
// Printed and handwriting-style invoices, clean and as rough "phone photos". Deterministic, so the
// same set (and the same numbers) come out every time. Needs the Playwright browser.
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const out = path.resolve(process.argv[2] ?? 'corpus');
const fontDir = process.env.FONT_DIR ?? '';
await mkdir(out, { recursive: true });

// Small seeded random generator (mulberry32).
let seed = Number(process.env.SEED ?? 20260123);
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (a) => a[Math.floor(rnd() * a.length)];

// How the amount is written on the page.
const lakh = (n) => {
  const s = String(Math.trunc(n));
  if (s.length <= 3) return s;
  const head = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${head},${s.slice(-3)}`;
};
const writes = {
  lakh2: (c) => `${lakh(c / 100)}.${String(c % 100).padStart(2, '0')}`,
  lakh0: (c) => lakh(Math.round(c / 100)),
  plain: (c) => String(Math.round(c / 100)),
  western2: (c) =>
    `${Math.trunc(c / 100)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${String(c % 100).padStart(2, '0')}`,
};
const cents = () => {
  const digits = pick([4, 5, 5, 6, 6, 7]);
  const whole = Math.floor(10 ** (digits - 1) + rnd() * 9 * 10 ** (digits - 1));
  return whole * 100;
};
const expectOf = (c) => `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, '0')}`;

const PRINTED = [
  ['inter', 'Inter, sans-serif'],
  ['serif', '"Liberation Serif", serif'],
  ['mono', '"DejaVu Sans Mono", monospace'],
  ['arial', '"Liberation Sans", Arial, sans-serif'],
];
const HAND = [
  ['caveat', 'caveat/files/caveat-latin-400-normal.woff2', 'Caveat'],
  ['patrick', 'patrick-hand/files/patrick-hand-latin-400-normal.woff2', 'Patrick Hand'],
  ['reenie', 'reenie-beanie/files/reenie-beanie-latin-400-normal.woff2', 'Reenie Beanie'],
  ['shadows', 'shadows-into-light/files/shadows-into-light-latin-400-normal.woff2', 'Shadows'],
  ['kalam', 'kalam/files/kalam-latin-400-normal.woff2', 'Kalam'],
  ['marker', 'permanent-marker/files/permanent-marker-latin-400-normal.woff2', 'Marker'],
  ['indie', 'indie-flower/files/indie-flower-latin-400-normal.woff2', 'Indie'],
  ['apple', 'homemade-apple/files/homemade-apple-latin-400-normal.woff2', 'Apple'],
];

// Every font is drawn four ways: label and amount on one row, and the amount under (or in a
// column below) its label, each both as a clean scan and as a rough phone photo.
const cases = [];
const fonts = [
  ...PRINTED.map(([id, family]) => ({ id, kind: 'printed', family })),
  ...HAND.map(([id, file, family]) => ({
    id,
    kind: 'handwritten',
    family: `"${family}", cursive`,
    face: { family, file: path.join(fontDir, 'node_modules/@fontsource', file) },
  })),
];
fonts.forEach((f, i) => {
  const other = i % 2 ? 'columns' : 'stacked';
  for (const layout of ['rows', other]) {
    for (const photo of [false, true]) {
      const hand = f.kind === 'handwritten';
      cases.push({
        ...f,
        id: `${hand ? 'hand' : 'print'}-${f.id}-${layout}-${photo ? 'photo' : 'clean'}`,
        photo,
        layout,
        style: pick(hand ? ['lakh2', 'lakh0', 'plain'] : ['lakh2', 'lakh0', 'plain', 'western2']),
        debit: cents(),
        credit: cents(),
        ink: hand ? pick(['#1b2a6b', '#222', '#0b3d91']) : '#222',
        lined: hand && rnd() < 0.5,
      });
    }
  }
});

function html(c) {
  const hand = c.kind === 'handwritten';
  const d = writes[c.style](c.debit);
  const k = writes[c.style](c.credit);
  const size = hand ? 54 : 30;
  const face = c.face ? `@font-face{font-family:"${c.face.family}";src:url("${c.face.url}")}` : '';
  const rows = {
    rows: `<div class="r"><span>Debit:</span><b>${d}</b></div><div class="r"><span>Credit:</span><b>${k}</b></div>`,
    stacked: `<div class="s"><span>Debit</span><b>${d}</b></div><div class="s"><span>Credit</span><b>${k}</b></div>`,
    columns: `<div class="cols"><div><span>Debit</span><b>${d}</b></div><div><span>Credit</span><b>${k}</b></div></div>`,
  }[c.layout];
  const lined = c.lined
    ? 'background-image:repeating-linear-gradient(transparent 0 66px,#9ab 66px 68px);'
    : '';
  const head = hand
    ? `<div class="h">Invoice no. ${Math.floor(1000 + rnd() * 8000)}</div>`
    : `<h1>INVOICE</h1><div class="m">No. 2026-${Math.floor(100 + rnd() * 800)} · Billed to <b>Sample Traders</b></div>`;
  const sheet = `<div class="sheet">${head}${rows}</div>`;
  const css = `${face}
    body{margin:0;font-family:${c.family};color:${c.ink ?? '#222'}}
    .sheet{width:760px;padding:34px 44px 40px;box-sizing:border-box;background:#fff;${lined}font-size:${size}px}
    h1{margin:0 0 6px;font-size:38px}.m{font-size:17px;color:#555;margin-bottom:22px}.h{font-size:30px;margin-bottom:16px;opacity:.8}
    .r{display:flex;justify-content:space-between;margin-top:10px;border-top:${hand ? 0 : 1}px solid #ddd;padding-top:6px}
    .s{margin-top:14px}.s b{display:block}.s span{display:block;font-size:${size * 0.7}px}
    .cols{display:flex;gap:80px;margin-top:14px}.cols b{display:block}
    b{font-weight:${hand ? 400 : 700}}`;
  if (!c.photo) return `<style>${css}</style><body>${sheet}</body>`;
  const tilt = (rnd() * 8 - 4).toFixed(1);
  const blur = (0.8 + rnd() * 1.4).toFixed(1);
  const light = pick(['115deg', '75deg', '160deg']);
  return `<style>${css}
    html,body{background:#3b3532}
    .desk{width:1000px;height:760px;display:flex;align-items:center;justify-content:center;
      background:radial-gradient(ellipse at 20% 15%,#6d625b 0%,#3b3532 70%);position:relative;overflow:hidden}
    .paper{transform:rotate(${tilt}deg) scale(.95);filter:blur(${blur}px) contrast(.8) brightness(.9);box-shadow:8px 14px 28px rgba(0,0,0,.55)}
    .paper .sheet{background-color:#f1eee4}
    .shade{position:absolute;inset:0;background:linear-gradient(${light},rgba(0,0,0,0) 40%,rgba(0,0,0,.45) 100%)}
  </style><body><div class="desk"><div class="paper">${sheet}</div><div class="shade"></div></div></body>`;
}

// Fonts are inlined: a page set with setContent may not load file:// fonts.
for (const c of cases) {
  if (c.face)
    c.face.url = `data:font/woff2;base64,${(await readFile(c.face.file)).toString('base64')}`;
}
const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const manifest = [];
for (const c of cases) {
  const p = await browser.newPage({
    viewport: c.photo ? { width: 1000, height: 760 } : { width: 760, height: 10 },
  });
  await p.setContent(html(c));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(150);
  const png = await (c.photo ? p : p.locator('.sheet')).screenshot();
  await p.close();
  const file = c.photo ? `${c.id}.jpg` : `${c.id}.png`;
  const img = sharp(png);
  await writeFile(
    path.join(out, file),
    c.photo ? await img.jpeg({ quality: 50 }).toBuffer() : await img.png().toBuffer(),
  );
  manifest.push({
    file,
    kind: c.kind,
    photo: c.photo,
    layout: c.layout,
    debit: expectOf(c.debit),
    credit: expectOf(c.credit),
  });
}
await browser.close();
await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Wrote ${manifest.length} pictures to ${out}`);
