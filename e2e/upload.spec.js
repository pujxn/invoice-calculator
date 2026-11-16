import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { expectNoSideScroll, expectTouchFriendly, shot, signIn } from './helpers.js';

const PNG = fileURLToPath(new URL('./fixtures/sample-invoice.png', import.meta.url));
const JPG = fileURLToPath(new URL('./fixtures/sample-invoice.jpg', import.meta.url));

const upload = (page, files) => page.getByTestId('file-input').setInputFiles(files);
const uploaded = (page) => page.getByText('Picture uploaded.');
const isPhone = () => test.info().project.use.hasTouch;

// Small in-memory files for the cases that do not need a real picture.
const fake = (name, mimeType, buffer) => ({ name, mimeType, buffer });
const heicBytes = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypheic'),
  Buffer.alloc(200),
]);

test('signed-out visitors cannot reach the upload screen or the upload API', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  const res = await request.post('/api/invoices', {
    multipart: { image: fake('a.png', 'image/png', Buffer.from('x')) },
  });
  expect(res.status()).toBe(401);
  expect((await request.get(`/api/invoices/${'0'.repeat(32)}/image`)).status()).toBe(401);
});

test('upload a picture, see the preview, keep it after a reload, then remove it', async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole('button', { name: 'Choose file' })).toBeVisible();
  await shot(page, 'upload-01-picker');

  await upload(page, PNG);
  await expect(uploaded(page)).toBeVisible();
  const preview = page.getByAltText('Preview of sample-invoice.png');
  await expect(preview).toBeVisible();
  // The picture really loaded (not a broken-image icon).
  expect(await preview.evaluate((img) => img.naturalWidth)).toBeGreaterThan(100);
  await shot(page, 'upload-03-uploaded');

  await page.reload();
  await expect(page.getByAltText('Preview of sample-invoice.png')).toBeVisible();
  expect(
    await page.getByAltText('Preview of sample-invoice.png').evaluate((i) => i.naturalWidth),
  ).toBeGreaterThan(100);

  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('button', { name: 'Choose file' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Choose file' })).toBeVisible();
  await expect(uploaded(page)).toBeHidden();
});

test('replacing a picture shows the new one', async ({ page }) => {
  await signIn(page);
  await upload(page, PNG);
  await expect(page.getByAltText('Preview of sample-invoice.png')).toBeVisible();
  await page.getByRole('button', { name: 'Replace picture' }).click({ trial: true });
  await upload(page, JPG);
  await expect(page.getByAltText('Preview of sample-invoice.jpg')).toBeVisible();
  await expect(page.getByAltText('Preview of sample-invoice.png')).toBeHidden();
  await page.reload();
  await expect(page.getByAltText('Preview of sample-invoice.jpg')).toBeVisible();
});

test('a PDF is refused straight away, with no upload attempted', async ({ page }) => {
  await signIn(page);
  const posts = [];
  page.on(
    'request',
    (r) => r.method() === 'POST' && r.url().includes('/api/invoices') && posts.push(r),
  );
  await upload(page, fake('invoice.pdf', 'application/pdf', Buffer.from('%PDF-1.7 hello')));
  await expect(page.getByRole('alert')).toContainText('not a JPEG, PNG, WebP or HEIC');
  await expect(page.getByRole('button', { name: 'Choose file' })).toBeVisible();
  expect(posts).toHaveLength(0);
  await shot(page, 'upload-04-wrong-type');
});

test('a text file renamed to .jpg gets past the browser check but the server refuses it', async ({
  page,
}) => {
  await signIn(page);
  await upload(
    page,
    fake('invoice.jpg', 'image/jpeg', Buffer.from('just some words, not a picture')),
  );
  await expect(page.getByRole('alert')).toContainText('not a JPEG, PNG, WebP or HEIC');
  await expect(uploaded(page)).toBeHidden();
  await shot(page, 'upload-05-server-refuses');
  // Trying again with a real picture works.
  await upload(page, PNG);
  await expect(uploaded(page)).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
});

test('a picture over 10 MB is refused with its size and the limit', async ({ page }) => {
  await signIn(page);
  await upload(page, fake('huge.png', 'image/png', Buffer.alloc(11 * 1024 * 1024, 1)));
  await expect(page.getByRole('alert')).toContainText('11.0 MB');
  await expect(page.getByRole('alert')).toContainText('limit is 10 MB');
  await shot(page, 'upload-06-too-big');
});

test('a HEIC picture uploads even though this browser cannot preview it', async ({ page }) => {
  await signIn(page);
  await upload(page, fake('IMG_0688.HEIC', 'image/heic', heicBytes));
  await expect(uploaded(page)).toBeVisible();
  await expect(page.getByRole('img', { name: 'No preview of IMG_0688.HEIC' })).toBeVisible();
  await shot(page, 'upload-07-heic-no-preview');
});

test('the upload shows progress and can be cancelled', async ({ page }) => {
  await signIn(page);
  let release;
  const held = new Promise((r) => (release = r));
  await page.route('**/api/invoices', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await held;
    await route.abort();
  });
  await upload(page, PNG);
  await expect(page.getByRole('progressbar', { name: 'Upload progress' })).toBeVisible();
  await expect(page.getByText(/Uploading… \d+%/)).toBeVisible();
  await expect(page.getByAltText('Preview of sample-invoice.png')).toBeVisible();
  await shot(page, 'upload-02-uploading');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Choose file' })).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
  release();
});

test('if the server cannot be reached the user is told and can try again', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/invoices', (route) =>
    route.request().method() === 'POST' ? route.abort() : route.continue(),
  );
  await upload(page, PNG);
  await expect(page.getByRole('alert')).toContainText('Cannot reach the server');
  await page.unroute('**/api/invoices');
  await upload(page, PNG);
  await expect(uploaded(page)).toBeVisible();
});

test('an ended session during upload sends the user back to sign in', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/invoices', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 401, json: { error: 'Please sign in.' } })
      : route.continue(),
  );
  await upload(page, PNG);
  await expect(page).toHaveURL(/\/login$/);
});

test('the next person to sign in on the same tab does not see the previous picture', async ({
  page,
}) => {
  await signIn(page);
  await upload(page, PNG);
  await expect(uploaded(page)).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await signIn(page);
  await expect(page.getByRole('button', { name: 'Choose file' })).toBeVisible();
  await expect(uploaded(page)).toBeHidden();
});

test('phones can open the camera; desktops only offer the file picker', async ({ page }) => {
  await signIn(page);
  const camera = page.getByRole('button', { name: 'Take photo' });
  await expect(page.getByTestId('camera-input')).toHaveAttribute('capture', 'environment');
  if (!isPhone()) {
    await expect(camera).toBeHidden();
    return;
  }
  await expect(camera).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), camera.tap()]);
  await chooser.setFiles(JPG);
  await expect(page.getByAltText('Preview of sample-invoice.jpg')).toBeVisible();
  await expect(uploaded(page)).toBeVisible();
});

test('the upload screen fits the phone, with big buttons, before and after uploading', async ({
  page,
}) => {
  await signIn(page);
  await expectNoSideScroll(page);
  await expectTouchFriendly(page);
  await upload(page, PNG);
  await expect(uploaded(page)).toBeVisible();
  await expectNoSideScroll(page);
  await expectTouchFriendly(page);
  // A very long file name must not push the page sideways.
  await page.getByRole('button', { name: 'Remove' }).click();
  const longName = `${'very-long-invoice-name-'.repeat(8)}.png`;
  await upload(page, fake(longName, 'image/png', readFileSync(PNG)));
  await expect(uploaded(page)).toBeVisible();
  await expectNoSideScroll(page);
});
