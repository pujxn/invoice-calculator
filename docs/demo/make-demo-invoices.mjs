/* global process, console */
// Regenerates the sample invoice pictures used for the manager demo:
//   node docs/demo/make-demo-invoices.mjs
// They are made-up inputs (not screenshots of the app). Needs the Playwright browser:
//   npx playwright install chromium
import { chromium } from '@playwright/test';
import { fileURLToPath, URL } from 'node:url';

const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const fmt = (n) =>
  n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Each invoice lists its Debit and Credit lines; the printed totals are the sums.
const invoices = [
  {
    file: 'demo-1-net-debit.png',
    no: '2026-0142',
    date: '16 Nov 2026',
    client: 'Harbour Street Cafe',
    debit: [
      ['Kitchen rewiring', 900.5],
      ['Materials', 350.0],
    ],
    credit: [['Deposit received', 400.0]],
  },
  {
    file: 'demo-2-net-credit.png',
    no: '2026-0157',
    date: '18 Nov 2026',
    client: 'Maple Court Dental',
    debit: [
      ['Call-out fee', 120.0],
      ['Fittings', 180.0],
    ],
    credit: [
      ['Deposit received', 1000.0],
      ['Adjustment for returned parts', 125.75],
    ],
  },
  {
    file: 'demo-3-balanced.png',
    no: '2026-0163',
    date: '20 Nov 2026',
    client: 'Northgate Print Shop',
    debit: [['Consulting, 8 hours', 640.0]],
    credit: [['Payment received', 640.0]],
  },
  {
    // Looks like a quick phone photo: slightly rotated, soft focus, uneven light, on a desk.
    file: 'demo-4-tricky-blurry.jpg',
    no: '2026-0171',
    date: '23 Nov 2026',
    client: 'Willow Farm Supplies',
    debit: [
      ['Fencing and gates', 1980.25],
      ['Delivery', 500.0],
    ],
    credit: [
      ['Deposit received', 600.0],
      ['Part payment', 315.0],
    ],
    photo: true,
  },
];

const sum = (lines) => lines.reduce((t, [, a]) => t + a, 0);

function page(inv) {
  const rows = [
    ...inv.debit.map(
      ([d, a]) => `<tr><td>${d}</td><td class="n">${fmt(a)}</td><td class="n"></td></tr>`,
    ),
    ...inv.credit.map(
      ([d, a]) => `<tr><td>${d}</td><td class="n"></td><td class="n">${fmt(a)}</td></tr>`,
    ),
  ].join('');
  const sheet = `
  <div class="sheet">
    <div class="top"><div><h1>INVOICE</h1><div class="muted">No. ${inv.no} &middot; ${inv.date}</div></div>
    <div class="muted right">Billed to<br><b>${inv.client}</b></div></div>
    <table>
      <tr><th>Description</th><th class="n">Debit</th><th class="n">Credit</th></tr>
      ${rows}
    </table>
    <div class="totals">
      <div class="t"><b>Debit:</b><b>£${fmt(sum(inv.debit))}</b></div>
      <div class="t"><b>Credit:</b><b>£${fmt(sum(inv.credit))}</b></div>
    </div>
  </div>`;
  const css = `
    body{margin:0;font:20px system-ui,Arial,sans-serif;color:#222}
    .sheet{width:640px;padding:36px 40px;background:#fff;box-sizing:border-box}
    h1{margin:0 0 4px;font-size:34px;letter-spacing:1px}
    .muted{color:#666;font-size:16px}.right{text-align:right}
    .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}
    table{width:100%;border-collapse:collapse}
    th{background:#fde8f0;text-align:left;padding:8px}td{padding:8px;border-bottom:1px solid #eee}
    .n{text-align:right}
    .totals{margin-top:28px;border-top:2px solid #222;padding-top:12px}
    .t{display:flex;justify-content:space-between;font-size:26px;margin-top:6px}`;
  if (!inv.photo) return `<style>${css}</style><body>${sheet}</body>`;
  return `<style>${css}
    html,body{background:#3b3532}
    .desk{width:820px;height:760px;display:flex;align-items:center;justify-content:center;
      background:radial-gradient(ellipse at 20% 15%,#6d625b 0%,#3b3532 70%);position:relative;overflow:hidden}
    .paper{transform:rotate(-2deg);filter:blur(1.3px) contrast(.82) brightness(.93);
      box-shadow:8px 14px 28px rgba(0,0,0,.55)}
    .paper .sheet{background:#f4f1e8}
    .shade{position:absolute;inset:0;background:linear-gradient(115deg,rgba(0,0,0,0) 45%,rgba(0,0,0,.38) 100%)}
  </style><body><div class="desk"><div class="paper">${sheet}</div><div class="shade"></div></div></body>`;
}

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
for (const inv of invoices) {
  const p = await browser.newPage({
    viewport: inv.photo ? { width: 820, height: 760 } : { width: 640, height: 10 },
  });
  await p.setContent(page(inv));
  const target = inv.photo ? p : p.locator('.sheet');
  if (inv.file.endsWith('.jpg'))
    await p.screenshot({ path: here(inv.file), type: 'jpeg', quality: 55 });
  else await target.screenshot({ path: here(inv.file) });
  await p.close();
}
await browser.close();
console.log('Wrote', invoices.map((i) => i.file).join(', '));
