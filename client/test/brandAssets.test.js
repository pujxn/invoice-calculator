import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..') + '/';
const read = (rel) => readFileSync(`${root}${rel}`, 'utf8');
const SVGS = ['logo', 'logo-dark', 'logo-mark', 'logo-mark-dark', 'favicon'];

describe('brand SVGs', () => {
  it.each(SVGS)('%s.svg is self-contained and well formed', (name) => {
    const svg = read(`public/brand/${name}.svg`);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 \d+ 64"/);
    expect(svg.trim().endsWith('</svg>')).toBe(true);
    // No scripts, external references or embedded fonts: the wordmark is outlined.
    expect(svg).not.toMatch(/<script|<image|<style|href=|url\(|font-family|<text/i);
    // Only the lockups and marks carry an accessible name; favicon is decoration.
    if (name !== 'favicon') {
      expect(svg).toContain('role="img"');
      expect(svg).toContain('<title id="t">Ledgerly</title>');
    }
  });

  it('lockup ratio matches what Logo.jsx assumes (253x64)', () => {
    for (const name of ['logo', 'logo-dark']) {
      expect(read(`public/brand/${name}.svg`)).toContain('viewBox="0 0 253 64"');
    }
  });

  // PNG header: width and height are big-endian 32-bit ints at bytes 16 and 20.
  const size = (file) => {
    const png = readFileSync(`${root}${file}`);
    expect(png.subarray(1, 4).toString(), file).toBe('PNG');
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
  };

  it.each([
    ['public/brand/favicon-32.png', 32],
    ['public/brand/apple-touch-icon.png', 180],
    ['public/brand/icon-192.png', 192],
    ['public/brand/icon-512.png', 512],
    ['public/brand/icon-maskable-512.png', 512],
  ])('%s is a %ipx square PNG', (file, px) => {
    expect(size(file)).toEqual([px, px]);
  });

  // Names and sizes that @capacitor/assets looks for in client/assets.
  it.each([
    ['assets/icon-only.png', 1024],
    ['assets/icon-foreground.png', 1024],
    ['assets/icon-background.png', 1024],
    ['assets/splash.png', 2732],
    ['assets/splash-dark.png', 2732],
  ])('Capacitor source %s is %ipx square', (file, px) => {
    expect(size(file)).toEqual([px, px]);
  });
});

describe('index.html', () => {
  const html = read('index.html');

  it('is titled Ledgerly and links existing icons', () => {
    expect(html).toContain('<title>Ledgerly</title>');
    expect(html).not.toMatch(/Invoice Calculator/);
    for (const [, href] of html.matchAll(
      /<link rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g,
    )) {
      expect(existsSync(`${root}public${href}`), href).toBe(true);
    }
    expect(html).toContain('name="theme-color"');
  });
});

describe('web app manifest', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));

  it('names the app and uses the brand colours', () => {
    expect(manifest.name).toBe('Ledgerly');
    expect(manifest.theme_color).toBe('#0b6b5d');
    expect(manifest.display).toBe('standalone');
  });

  it('lists icons that exist, including a maskable one', () => {
    for (const icon of manifest.icons) {
      expect(existsSync(`${root}public${icon.src}`), icon.src).toBe(true);
    }
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('is linked from index.html with a light and a dark theme colour', () => {
    const html = read('index.html');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toMatch(/theme-color" content="#0f1b1a" media="\(prefers-color-scheme: dark\)"/);
  });
});
