import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { expectNoSideScroll, expectTouchFriendly, shot, signIn } from './helpers.js';

const PNG = fileURLToPath(new URL('./fixtures/sample-invoice.png', import.meta.url));
const JPG = fileURLToPath(new URL('./fixtures/sample-invoice.jpg', import.meta.url));

// These tests run against the real server in mock mode (VISION_PROVIDER=mock): no AI key and
// no network. Failures from the AI are staged by answering the extract call ourselves.
const EXTRACT = '**/api/invoices/*/extract';
const upload = (page, file) => page.getByTestId('file-input').setInputFiles(file);
const readButton = (page) => page.getByRole('button', { name: 'Read amounts' });
const resultsHeading = (page) => page.getByRole('heading', { name: 'Amounts we found' });
const debit = (page) => page.getByLabel(/^Debit/);
const credit = (page) => page.getByLabel(/^Credit/);

async function uploadAndRead(page, file = PNG) {
  await upload(page, file);
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  await readButton(page).click();
  await expect(resultsHeading(page)).toBeVisible();
}

const sample = (over = {}) => ({
  invoiceId: 'a'.repeat(32),
  provider: 'claude',
  model: 'claude-test',
  imageDeleted: true,
  debit: '1250.50',
  credit: '400.00',
  currency: 'INR',
  confidence: 'high',
  notes: '',
  warnings: [],
  lineItems: [],
  itemTotals: null,
  ...over,
});
const failWith =
  (status, body, headers = {}) =>
  (route) =>
    route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });

test('extracting needs a signed-in user', async ({ request }) => {
  const res = await request.post(`/api/invoices/${'0'.repeat(32)}/extract`);
  expect(res.status()).toBe(401);
});

test('read the amounts from an uploaded picture, then check them', async ({ page }) => {
  await signIn(page);
  await upload(page, PNG);
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  await shot(page, 'extract-01-ready-to-read');

  const response = page.waitForResponse((r) => r.url().endsWith('/extract'));
  await readButton(page).click();
  await expect(resultsHeading(page)).toBeVisible();
  const reading = await (await response).json();

  // Exact decimals, never floats.
  expect(reading.debit).toMatch(/^\d+\.\d\d$/);
  expect(reading.credit).toMatch(/^\d+\.\d\d$/);
  await expect(debit(page)).toHaveValue(reading.debit);
  await expect(credit(page)).toHaveValue(reading.credit);
  await expect(page.getByText(/Demo values \(no AI key is set\)/)).toBeVisible();
  await expect(page.getByText(/Confidence:/)).toContainText('High');
  const table = page.getByRole('table', { name: 'Lines found on the invoice' });
  await expect(table).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(reading.lineItems.length + 2);
  await expectNoSideScroll(page);
  await expectTouchFriendly(page);
  await shot(page, 'extract-03-results');

  // The server deleted the picture once it had been read.
  const token = await page.evaluate(
    () => JSON.parse(localStorage.getItem('invoice-calculator.session')).token,
  );
  const gone = await page.request.get(`/api/invoices/${reading.invoiceId}/image`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(gone.status()).toBe(404);
});

test('the same picture gives the same demo amounts', async ({ page }) => {
  await signIn(page);
  await uploadAndRead(page, PNG);
  const first = [await debit(page).inputValue(), await credit(page).inputValue()];
  await page.getByRole('button', { name: 'Upload a different invoice' }).click();
  await uploadAndRead(page, PNG);
  expect([await debit(page).inputValue(), await credit(page).inputValue()]).toEqual(first);
  await page.getByRole('button', { name: 'Upload a different invoice' }).click();
  await uploadAndRead(page, JPG);
  expect(await debit(page).inputValue()).not.toBe(first[0]);
});

test('shows a loading state while reading, and Cancel stops it', async ({ page }) => {
  await signIn(page);
  await upload(page, PNG);
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  let release;
  const held = new Promise((r) => (release = r));
  await page.route(EXTRACT, async (route) => {
    await held;
    await route.abort().catch(() => {});
  });
  await readButton(page).click();
  await expect(page.getByRole('status')).toContainText('Reading your invoice');
  await expect(page.getByAltText('Preview of sample-invoice.png')).toBeVisible();
  await expect(readButton(page)).toBeHidden();
  await shot(page, 'extract-02-reading');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(readButton(page)).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
  release();
});

test('errors are shown, the picture stays, and trying again works', async ({ page }) => {
  await signIn(page);
  await upload(page, PNG);
  await expect(page.getByText('Picture uploaded.')).toBeVisible();

  await page.route(
    EXTRACT,
    failWith(504, {
      error: 'Reading the invoice took too long. Please try again.',
      code: 'timeout',
    }),
    { times: 1 },
  );
  await readButton(page).click();
  await expect(page.getByRole('alert')).toContainText('took too long');
  await expect(page.getByAltText('Preview of sample-invoice.png')).toBeVisible();
  await shot(page, 'extract-04-error-timeout');

  await page.route(
    EXTRACT,
    failWith(
      429,
      { error: 'The AI service is busy right now.', code: 'rate_limited', retryAfterSeconds: 20 },
      { 'Retry-After': '20' },
    ),
    { times: 1 },
  );
  await readButton(page).click();
  await expect(page.getByRole('alert')).toContainText('busy right now. Try again in 20 seconds.');

  await page.route(
    EXTRACT,
    failWith(422, {
      error: 'We could not find an invoice in this picture. Try a clearer, well lit photo.',
      code: 'unreadable_invoice',
    }),
    { times: 1 },
  );
  await readButton(page).click();
  await expect(page.getByRole('alert')).toContainText('could not find an invoice');

  // No more staged failures: the real server answers.
  await readButton(page).click();
  await expect(resultsHeading(page)).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
});

test('a file that is not really a picture is reported by the real server', async ({ page }) => {
  await signIn(page);
  // Starts like a HEIC file, so the upload accepts it, but there is no picture inside.
  const heic = Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]),
    Buffer.from('ftypheic'),
    Buffer.alloc(200),
  ]);
  await upload(page, { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: heic });
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  await readButton(page).click();
  await expect(page.getByRole('alert')).toContainText('could not open this picture');
  await expect(readButton(page)).toBeVisible();
  await shot(page, 'extract-05-error-unreadable');
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('button', { name: 'Choose file' })).toBeVisible();
});

test('if the AI is down the amounts can be typed by hand', async ({ page }) => {
  await signIn(page);
  await upload(page, PNG);
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  await page.route(
    EXTRACT,
    failWith(502, { error: 'The AI service had a problem. Please try again.', code: 'x' }),
  );
  await readButton(page).click();
  await expect(page.getByRole('alert')).toContainText('The AI service had a problem');
  await page.getByRole('button', { name: 'Type the amounts instead' }).click();
  await expect(page.getByRole('heading', { name: 'Enter the amounts' })).toBeVisible();
  await expect(debit(page)).toHaveValue('');
  await debit(page).fill('820.40');
  await credit(page).fill('20');
  await page.reload();
  await expect(debit(page)).toHaveValue('820.40');
  await expect(credit(page)).toHaveValue('20');
  await expectNoSideScroll(page);
  await shot(page, 'extract-09-type-by-hand');
});

test('amounts the AI was unsure about are flagged and left blank', async ({ page }) => {
  await signIn(page);
  await upload(page, PNG);
  await expect(page.getByText('Picture uploaded.')).toBeVisible();
  await page.route(
    EXTRACT,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          sample({
            debit: null,
            confidence: 'low',
            notes: 'The Debit total is partly covered by a stamp.',
            warnings: [
              {
                field: 'debit',
                code: 'ambiguous',
                message: '"1,234" could mean 1,234 or 1.234.',
              },
            ],
          }),
        ),
      }),
    { times: 1 },
  );
  await readButton(page).click();
  await expect(resultsHeading(page)).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('could mean 1,234 or 1.234');
  await expect(page.getByText('partly covered by a stamp')).toBeVisible();
  await expect(debit(page)).toHaveValue('');
  await expect(credit(page)).toHaveValue('400.00');
  await expect(page.getByText(/Confidence:/)).toContainText('Low');
  await expectNoSideScroll(page);
  await shot(page, 'extract-06-low-confidence');
});

test('edit the amounts, see errors for bad entries, and keep edits after a reload', async ({
  page,
}) => {
  await signIn(page);
  await uploadAndRead(page);
  const found = [await debit(page).inputValue(), await credit(page).inputValue()];

  await debit(page).fill('1.2345678901234');
  await expect(page.getByText('Use at most 12 decimal places.')).toBeVisible();
  await expect(debit(page)).toHaveAttribute('aria-invalid', 'true');
  await shot(page, 'extract-07-edit-error');
  await debit(page).fill('-5');
  await expect(page.getByText('Amounts cannot be negative.')).toBeVisible();
  await debit(page).fill('abc');
  await expect(page.getByText(/^Enter a number such as 1250\.50/)).toBeVisible();

  // an amount with many decimals is fine: nothing is refused or rounded
  await debit(page).fill('12.345');
  await expect(debit(page)).toHaveAttribute('aria-invalid', 'false');
  await expect(page.getByText('Use at most')).toBeHidden();
  await debit(page).fill('1300.5');
  await credit(page).fill('');
  await expect(page.getByText('Use at most')).toBeHidden();
  await expect(page.getByText('Blank counts as none.')).toBeVisible();
  await shot(page, 'extract-08-edited');

  await page.reload();
  await expect(resultsHeading(page)).toBeVisible();
  await expect(debit(page)).toHaveValue('1300.5');
  await expect(credit(page)).toHaveValue('');

  await page.getByRole('button', { name: 'Reset to what was found' }).click();
  await expect(debit(page)).toHaveValue(found[0]);
  await expect(credit(page)).toHaveValue(found[1]);
  await expect(page.getByRole('button', { name: 'Reset to what was found' })).toBeHidden();
});

test('"Upload a different invoice" starts again, and a reload then shows the upload screen', async ({
  page,
}) => {
  await signIn(page);
  await uploadAndRead(page);
  await page.getByRole('button', { name: 'Upload a different invoice' }).click();
  await expect(page.getByRole('button', { name: 'Choose file' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Upload your invoice' })).toBeVisible();
  await expect(resultsHeading(page)).toBeHidden();
});

test("a user never sees another user's reading after signing out and in", async ({ page }) => {
  await signIn(page);
  await uploadAndRead(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Upload your invoice' })).toBeVisible();
  await expect(resultsHeading(page)).toBeHidden();
});

for (const scheme of ['light', 'dark']) {
  test(`the results and error screens pass the accessibility checks (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await signIn(page);
    await upload(page, PNG);
    await expect(page.getByText('Picture uploaded.')).toBeVisible();
    const check = async () => {
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(violations.map((v) => `${v.id}: ${v.nodes[0].html}`)).toEqual([]);
    };
    await page.route(
      EXTRACT,
      failWith(502, { error: 'The AI gave an answer we could not use.', code: 'bad_model_output' }),
      { times: 1 },
    );
    await readButton(page).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await check();

    await readButton(page).click();
    await expect(resultsHeading(page)).toBeVisible();
    await check();
    await debit(page).fill('1.2345678901234');
    await expect(page.getByText('Use at most 12 decimal places.')).toBeVisible();
    await check();
  });
}
