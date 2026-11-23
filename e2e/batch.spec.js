import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectNoSideScroll, expectTouchFriendly, shot, signIn } from './helpers.js';

const PNG = readFileSync(fileURLToPath(new URL('./fixtures/sample-invoice.png', import.meta.url)));

// The mock reader (the API the UI tests run against) gives amounts from a hash of the picture's
// bytes, so every file here gets a few unnamed bytes added: different files, different amounts.
const invoice = (n) => ({
  name: `invoice-${String(n).padStart(2, '0')}.png`,
  mimeType: 'image/png',
  buffer: Buffer.concat([PNG, Buffer.from(`-${n}`)]),
});
const invoices = (count, from = 1) => Array.from({ length: count }, (_, i) => invoice(from + i));

const EXTRACT = '**/api/invoices/*/extract';
const batchInput = (page) => page.getByTestId('batch-input');
const total = (page) => page.getByTestId('batch-final');
const rows = (page) => page.locator('.batch-row');
const allFinished = (page, n) => expect(page.getByText(`All ${n} finished.`)).toBeVisible();

// Opens the batch by choosing several files on the upload screen, as a person does.
async function startBatch(page, files) {
  await signIn(page);
  await page.getByTestId('file-input').setInputFiles(files);
  await expect(page.getByRole('heading', { name: 'Several invoices at once' })).toBeVisible();
}

const cents = (text) => {
  const [w, f = ''] = String(text || '0')
    .replaceAll(',', '')
    .split('.');
  return BigInt(w) * 100n + BigInt(f.padEnd(2, '0').slice(0, 2));
};
const money = (c) => {
  const abs = c < 0n ? -c : c;
  const [w, f] = [String(abs / 100n), String(abs % 100n).padStart(2, '0')];
  const grouped =
    w.length <= 3 ? w : `${w.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${w.slice(-3)}`;
  return `₹${grouped}.${f}`;
};

// What the boxes on the page add up to, worked out here separately from the app.
async function expectedFromBoxes(page, { skip = [] } = {}) {
  let debit = 0n;
  let credit = 0n;
  for (const li of await rows(page).all()) {
    const name = await li.locator('.filename').innerText();
    if (skip.some((s) => name.includes(s))) continue;
    if ((await li.getAttribute('data-status')) !== 'done') continue;
    debit += cents(await li.getByLabel(/^Debit/).inputValue());
    credit += cents(await li.getByLabel(/^Credit/).inputValue());
  }
  return { debit, credit, net: debit - credit };
}

async function expectTotalMatchesBoxes(page, options) {
  const want = await expectedFromBoxes(page, options);
  await expect(page.getByTestId('total-debit')).toHaveText(money(want.debit));
  await expect(page.getByTestId('total-credit')).toHaveText(money(want.credit));
  await expect(total(page).locator('.final-amount')).toHaveText(
    money(want.net < 0n ? -want.net : want.net),
  );
  await expect(total(page).locator('.final-label')).toHaveText(
    want.net > 0n ? 'Net Debit' : want.net < 0n ? 'Net Credit' : 'Balanced',
  );
}

test('the batch API paths need a signed-in user', async ({ request }) => {
  expect((await request.get('/api/invoices/reading-methods')).status()).toBe(401);
});

test('choose several invoices at once, see each one, and get one combined total', async ({
  page,
}) => {
  await startBatch(page, invoices(6));
  await shot(page, 'batch-01-reading');
  await allFinished(page, 6);
  await expect(rows(page)).toHaveCount(6);
  await expect(page.getByTestId('total-counted')).toHaveText('Counting 6 of 6 invoices.');
  for (const li of await rows(page).all()) {
    await expect(li).toHaveAttribute('data-status', 'done');
    await expect(li.getByLabel(/^Debit/)).not.toHaveValue('');
  }
  await expectTotalMatchesBoxes(page);
  await shot(page, 'batch-02-combined-total');

  // Correcting one invoice's amount moves the total straight away.
  const first = rows(page).first();
  await first.getByLabel(/^Debit/).fill('1,00,000');
  await expectTotalMatchesBoxes(page);
  await shot(page, 'batch-03-edited-amount');
  await expect(first.getByTestId('row-net')).toContainText('This invoice:');

  await page.getByRole('button', { name: 'Copy total' }).click();
});

test('a picture that fails does not block the total, and a retry brings it in', async ({
  page,
}) => {
  let calls = 0;
  let failing = true;
  await page.route(EXTRACT, async (route) => {
    calls += 1;
    if (failing && calls === 2) {
      return route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'We could not find an invoice in this picture. Try a clearer photo.',
          code: 'unreadable_invoice',
        }),
      });
    }
    return route.continue();
  });
  await startBatch(page, invoices(4));
  await allFinished(page, 4);
  await expect(
    rows(page).filter({ has: page.locator('[data-status="failed"], .failed') }),
  ).toHaveCount(1);
  const bad = page.locator('.batch-row.failed');
  await expect(bad.getByRole('alert')).toContainText('We could not find an invoice');
  await expect(page.getByTestId('total-counted')).toContainText('Counting 3 of 4 invoices');
  await expect(page.getByTestId('total-counted')).toContainText('1 failed');
  await expectTotalMatchesBoxes(page);
  await shot(page, 'batch-04-one-failed');

  failing = false;
  await bad.getByRole('button', { name: /^Retry/ }).click();
  await allFinished(page, 4);
  await expect(page.getByTestId('total-counted')).toHaveText('Counting 4 of 4 invoices.');
  await expectTotalMatchesBoxes(page);
});

test('a failed picture can be removed, or typed by hand', async ({ page }) => {
  let calls = 0;
  await page.route(EXTRACT, async (route) => {
    calls += 1;
    if (calls <= 2) {
      return route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'The AI service had a problem. Please try again.' }),
      });
    }
    return route.continue();
  });
  await startBatch(page, invoices(3));
  await allFinished(page, 3);
  const failed = page.locator('.batch-row.failed');
  await expect(failed).toHaveCount(2);
  await failed
    .first()
    .getByRole('button', { name: /^Remove/ })
    .click();
  await expect(rows(page)).toHaveCount(2);
  await page
    .locator('.batch-row.failed')
    .getByRole('button', { name: /^Type the amounts/ })
    .click();
  const typed = page.locator('.batch-row.done').filter({ hasNot: page.getByText('Read with') });
  await typed.getByLabel(/^Credit/).fill('100');
  await expectTotalMatchesBoxes(page);
});

test('dozens of invoices: limited to a few at a time, all read, one total', async ({ page }) => {
  let inFlight = 0;
  let peak = 0;
  await page.route(EXTRACT, async (route) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    try {
      await route.continue();
    } finally {
      inFlight -= 1;
    }
  });
  await startBatch(page, invoices(36));
  await allFinished(page, 36);
  await expect(page.getByTestId('total-counted')).toHaveText('Counting 36 of 36 invoices.');
  await expectTotalMatchesBoxes(page);
  expect(peak).toBeGreaterThan(0);
  expect(peak).toBeLessThanOrEqual(3);
  await shot(page, 'batch-05-dozens');
});

test('drop pictures onto the page, skip repeats, and keep the batch after a reload', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Several invoices at once' }).click();
  await expect(page.getByTestId('dropzone')).toBeVisible();

  const drop = (files) =>
    page.getByTestId('dropzone').evaluate(
      (zone, list) => {
        const data = new DataTransfer();
        for (const f of list) {
          data.items.add(
            new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, {
              type: f.type,
              lastModified: 1,
            }),
          );
        }
        zone.dispatchEvent(
          new DragEvent('dragenter', { dataTransfer: data, bubbles: true, cancelable: true }),
        );
        zone.dispatchEvent(
          new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
        );
      },
      files.map((f) => ({ name: f.name, type: f.mimeType, b64: f.buffer.toString('base64') })),
    );

  await drop(invoices(3));
  await allFinished(page, 3);
  await drop(invoices(2, 3)); // the third file again, plus one new
  await allFinished(page, 4);
  await expect(page.getByText(/1 file was already in the list/)).toBeVisible();
  await expect(rows(page)).toHaveCount(4);
  await expectTotalMatchesBoxes(page);

  const before = await total(page).textContent();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Several invoices at once' })).toBeVisible();
  await expect(rows(page)).toHaveCount(4);
  await expect(total(page)).toHaveText(before);

  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(rows(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Back to one invoice' }).click();
  await expect(page.getByRole('heading', { name: 'Upload your invoice' })).toBeVisible();
});

test('an invoice that is not a picture is shown as failed, and the others still total', async ({
  page,
}) => {
  await startBatch(page, [
    invoice(1),
    { name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') },
    invoice(2),
  ]);
  await allFinished(page, 3);
  const pdf = page.locator('.batch-row.failed');
  await expect(pdf).toHaveCount(1);
  await expect(pdf.getByRole('alert')).toContainText('not a JPEG, PNG, WebP or HEIC');
  await expect(pdf.getByRole('button', { name: /^Retry/ })).toHaveCount(0);
  await expectTotalMatchesBoxes(page);
});

test('the batch screen fits every screen, is touch friendly and passes the accessibility checks', async ({
  page,
}) => {
  await startBatch(page, invoices(3));
  await allFinished(page, 3);
  await expectNoSideScroll(page);
  if (test.info().project.use.hasTouch) await expectTouchFriendly(page);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, 'batch-06-dark');
  const dark = await new AxeBuilder({ page }).analyze();
  expect(dark.violations).toEqual([]);
});

test('the upload screen offers the batch, and one picture still goes the single way', async ({
  page,
}) => {
  await signIn(page);
  await shot(page, 'batch-07-upload-entry');
  await page.getByTestId('file-input').setInputFiles(invoice(1));
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Several invoices at once' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('button', { name: 'Several invoices at once' }).click();
  await expect(batchInput(page)).toBeAttached();
});
