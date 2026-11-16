// Regenerates the sample invoice pictures used by the UI tests:
//   node e2e/fixtures/make-fixtures.mjs
import { chromium } from '@playwright/test';
import { fileURLToPath, URL } from 'node:url';

const html = `<body style="margin:0;font:20px system-ui;background:#fff;color:#222">
<div style="width:600px;padding:40px">
  <h1 style="margin:0 0 4px;font-size:34px">INVOICE</h1>
  <div style="color:#666">No. 2026-0142 &middot; 16 Nov 2026</div>
  <hr style="margin:24px 0">
  <table style="width:100%;border-collapse:collapse">
    <tr style="background:#eef"><th align=left style="padding:8px">Description</th><th align=right>Amount</th></tr>
    <tr><td style="padding:8px">Consulting services</td><td align=right>1,250.00</td></tr>
    <tr><td style="padding:8px">Materials</td><td align=right>320.50</td></tr>
  </table>
  <div style="margin-top:32px;display:flex;justify-content:space-between;font-size:26px"><b>Debit</b><b>1,250.00</b></div>
  <div style="margin-top:8px;display:flex;justify-content:space-between;font-size:26px"><b>Credit</b><b>400.00</b></div>
</div></body>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 680, height: 520 } });
await page.setContent(html);
const here = (name) => fileURLToPath(new URL(name, import.meta.url));
await page.screenshot({ path: here('sample-invoice.png') });
await page.screenshot({ path: here('sample-invoice.jpg'), type: 'jpeg', quality: 70 });
await browser.close();
