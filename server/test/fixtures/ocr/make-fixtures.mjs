/* global process, console */
// Regenerates the extra invoice pictures the OCR tests read (the four demo invoices are in docs/demo):
//   node server/test/fixtures/ocr/make-fixtures.mjs
// Needs the Playwright browser (npx playwright install chromium). They are made-up inputs.
import { chromium } from '@playwright/test';
import { fileURLToPath, URL } from 'node:url';

const here = (name) => fileURLToPath(new URL(name, import.meta.url));
const css = `body{margin:0;font:22px Arial,Helvetica,sans-serif;color:#222}
  .sheet{width:640px;padding:36px 40px;background:#fff;box-sizing:border-box}
  h1{margin:0 0 18px;font-size:32px} table{width:100%;border-collapse:collapse}
  th{background:#fde8f0;text-align:left;padding:8px} td{padding:8px;border-bottom:1px solid #eee} .n{text-align:right}
  .t{display:flex;justify-content:space-between;font-size:26px;margin-top:10px;font-weight:bold}
  .big{font-size:30px;margin:14px 0}`;

const sheets = {
  // No table at all: just the two totals, as a quick note.
  'plain-text.png': `<h1>Invoice 88</h1><div class="big">Debit: ₹12,500.50</div><div class="big">Credit: ₹3,200.00</div>`,
  // Capitals, dashes, "Rs." and the Indian "/-" ending.
  'rs-slash.png': `<h1>BILL</h1><div class="big">DEBIT - Rs. 45,000/-</div><div class="big">CREDIT - Rs. 1,25,000/-</div>`,
  // Only a Debit column (no Credit at all).
  'debit-only.png': `<h1>INVOICE</h1><table><tr><th>Description</th><th class="n">Debit</th></tr>
    <tr><td>Paint</td><td class="n">1,200.00</td></tr><tr><td>Brushes</td><td class="n">450.50</td></tr></table>
    <div class="t"><span>Debit:</span><span>₹1,650.50</span></div>`,
  // The printed total does not add up: OCR must not show it as if it were certain.
  'total-does-not-add-up.png': `<h1>INVOICE</h1><table><tr><th>Description</th><th class="n">Debit</th><th class="n">Credit</th></tr>
    <tr><td>Parts</td><td class="n">1,000.00</td><td class="n"></td></tr><tr><td>Labour</td><td class="n">500.00</td><td class="n"></td></tr>
    <tr><td>Paid</td><td class="n"></td><td class="n">200.00</td></tr></table>
    <div class="t"><span>Debit:</span><span>₹1,600.00</span></div><div class="t"><span>Credit:</span><span>₹200.00</span></div>`,
  // A picture of text that is not an invoice.
  'not-an-invoice.png': `<h1>Meeting notes</h1><p class="big">Call the supplier about the delivery date.</p><p class="big">Book the room for Thursday.</p>`,
};

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
for (const [file, html] of Object.entries(sheets)) {
  const page = await browser.newPage({ viewport: { width: 640, height: 10 } });
  await page.setContent(`<style>${css}</style><body><div class="sheet">${html}</div></body>`);
  await page.locator('.sheet').screenshot({ path: here(file) });
  await page.close();
}
await browser.close();
console.log('Wrote', Object.keys(sheets).join(', '));
