import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';

const PHONE = '+447700900123';
const SHOTS = process.env.SCREENSHOT_DIR;

// Mock the API so these tests need only the web app.
async function mockApi(page) {
  await page.route('**/api/auth/request-otp', (r) =>
    r.fulfill({ json: { ok: true, resendAfterSeconds: 30 } }),
  );
  await page.route('**/api/auth/verify-otp', (r) =>
    r.fulfill({
      json: { token: 'tok', expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    }),
  );
  await page.route('**/api/auth/me', (r) => r.fulfill({ json: { phone: PHONE } }));
  await page.route('**/api/auth/logout', (r) => r.fulfill({ json: { ok: true } }));
}

async function shot(page, testInfo, name) {
  const body = await page.screenshot({ fullPage: true });
  await testInfo.attach(name, { body, contentType: 'image/png' });
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  }
}

for (const scheme of ['light', 'dark']) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });
    const logoFile = scheme === 'dark' ? 'logo-dark.svg' : 'logo.svg';

    test.beforeEach(async ({ page }) => {
      await mockApi(page);
    });

    test('login screen is branded', async ({ page }, testInfo) => {
      await page.goto('/login');
      await expect(page).toHaveTitle('Sign in · Ledgerly');
      const logo = page.getByRole('img', { name: 'Ledgerly' });
      await expect(logo).toBeVisible();
      // The picture element picks the variant matching the colour scheme, and it loads.
      await expect
        .poll(() => logo.evaluate((img) => img.currentSrc))
        .toMatch(new RegExp(`/brand/${logoFile}$`));
      expect(await logo.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
      await expect(page.getByText('Read the invoice. See the balance.')).toBeVisible();
      await expect(page.getByText('Invoice Calculator')).toHaveCount(0);
      await shot(page, testInfo, `login-${scheme}`);
    });

    test('login screen has no accessibility violations', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('img', { name: 'Ledgerly' })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations).toEqual([]);
    });

    test('code step stays branded and accessible', async ({ page }, testInfo) => {
      await page.goto('/login');
      await page.getByLabel('Mobile number').fill(PHONE);
      await page.getByRole('button', { name: 'Send code' }).click();
      await expect(page.getByLabel('6-digit code')).toBeVisible();
      await expect(page.getByRole('img', { name: 'Ledgerly' })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations).toEqual([]);
      await shot(page, testInfo, `login-code-${scheme}`);
    });

    test('signed-in header shows the logo and signs out', async ({ page }, testInfo) => {
      await page.goto('/login');
      await page.getByLabel('Mobile number').fill(PHONE);
      await page.getByRole('button', { name: 'Send code' }).click();
      await page.getByLabel('6-digit code').fill('123456');
      await page.getByRole('button', { name: 'Sign in' }).click();

      const header = page.getByRole('banner');
      await expect(header.getByRole('img', { name: 'Ledgerly' })).toBeVisible();
      await expect(header.getByRole('link', { name: 'Ledgerly home' })).toHaveAttribute(
        'href',
        '/',
      );
      await expect(page).toHaveTitle('Ledgerly');
      await expect(page.getByText(PHONE)).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations).toEqual([]);
      await shot(page, testInfo, `home-${scheme}`);

      await header.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/login$/);
    });

    test('primary button text meets AA contrast and focus ring is visible', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel('Mobile number').fill(PHONE);
      const button = page.getByRole('button', { name: 'Send code' });
      await expect(button).toBeEnabled();
      const ratio = await button.evaluate((el) => {
        const lum = (rgb) => {
          const [r, g, b] = rgb
            .match(/\d+/g)
            .slice(0, 3)
            .map((n) => {
              const c = Number(n) / 255;
              return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const s = getComputedStyle(el);
        const [a, b] = [lum(s.color), lum(s.backgroundColor)].sort((x, y) => y - x);
        return (a + 0.05) / (b + 0.05);
      });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      await page.keyboard.press('Tab'); // from the phone field
      await expect(button).toBeFocused();
      expect(await button.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    });
  });
}

test('manifest is served', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.status()).toBe(200);
  expect((await res.json()).name).toBe('Ledgerly');
});

test('brand assets are served', async ({ request }) => {
  for (const f of [
    'logo.svg',
    'logo-dark.svg',
    'logo-mark.svg',
    'logo-mark-dark.svg',
    'favicon.svg',
    'favicon-32.png',
    'apple-touch-icon.png',
    'icon-192.png',
    'icon-512.png',
    'icon-maskable-512.png',
  ]) {
    const res = await request.get(`/brand/${f}`);
    expect(res.status(), f).toBe(200);
  }
});

test('page declares the favicon and theme colour', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login');
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute(
    'href',
    '/brand/favicon.svg',
  );
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
    'content',
    '#0b6b5d',
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
});

// Mobile first: the app is later wrapped for phones, so check phone widths too.
const PHONES = [
  ['iphone-se', { width: 320, height: 568 }],
  ['phone', { width: 390, height: 844 }],
];
for (const scheme of ['light', 'dark']) {
  for (const [name, viewport] of PHONES) {
    test.describe(`${name} ${scheme}`, () => {
      test.use({ colorScheme: scheme, viewport, hasTouch: true, isMobile: true });

      test('login and header fit the screen without sideways scrolling', async ({
        page,
      }, testInfo) => {
        await mockApi(page);
        await page.goto('/login');
        await expect(page.getByRole('img', { name: 'Ledgerly' })).toBeVisible();
        const noOverflow = () =>
          page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        expect(await noOverflow()).toBe(true);
        const button = page.getByRole('button', { name: 'Send code' });
        await page.getByLabel('Mobile number').fill(PHONE);
        const box = await button.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44); // touch target
        await shot(page, testInfo, `login-${name}-${scheme}`);

        await button.click();
        await page.getByLabel('6-digit code').fill('123456');
        await page.getByRole('button', { name: 'Sign in' }).click();
        const header = page.getByRole('banner');
        await expect(header.getByRole('img', { name: 'Ledgerly' })).toBeVisible();
        const signOut = await header.getByRole('button', { name: 'Sign out' }).boundingBox();
        expect(signOut.x + signOut.width).toBeLessThanOrEqual(viewport.width);
        expect(await noOverflow()).toBe(true);
        await shot(page, testInfo, `home-${name}-${scheme}`);
      });
    });
  }
}
