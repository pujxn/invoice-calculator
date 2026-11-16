import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Guards the WCAG AA contrast of the colour tokens in styles.css.
const css = readFileSync(resolve(import.meta.dirname, '../src/styles.css'), 'utf8');

function tokens(block) {
  return Object.fromEntries(
    [...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]),
  );
}
const [lightBlock] = css.match(/:root\s*\{[\s\S]*?\n\}/);
const [darkBlock] = css.match(/@media \(prefers-color-scheme: dark\)\s*\{[\s\S]*?\n\}\n/);
const light = tokens(lightBlock);
const dark = { ...light, ...tokens(darkBlock) };

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme contrast', (_name, t) => {
  it.each([
    ['text', 'bg', 4.5],
    ['text', 'surface', 4.5],
    ['text-muted', 'bg', 4.5],
    ['text-muted', 'surface', 4.5],
    ['on-primary', 'primary-hover', 4.5],
    ['primary', 'bg', 4.5],
    ['good-text', 'good-bg', 4.5],
    ['bad-text', 'bad-bg', 4.5],
    ['on-primary', 'primary', 4.5],
    ['border', 'surface', 3], // input outline, WCAG 1.4.11
    ['focus', 'bg', 3],
  ])('%s on %s is at least %s:1', (fg, bg, min) => {
    expect(t[fg], `missing token ${fg}`).toBeDefined();
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
});

function hue(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

// The brand direction: pink UI, green for credit/success, yellow highlight.
describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme palette', (_name, t) => {
  it('is pink, green and yellow', () => {
    expect(hue(t.primary)).toBeGreaterThanOrEqual(325);
    expect(hue(t.primary)).toBeLessThanOrEqual(350);
    expect(hue(t['good-text'])).toBeGreaterThanOrEqual(120);
    expect(hue(t['good-text'])).toBeLessThanOrEqual(160);
    expect(hue(t.accent)).toBeGreaterThanOrEqual(38);
    expect(hue(t.accent)).toBeLessThanOrEqual(52);
    expect(hue(t.bg)).toBeGreaterThanOrEqual(325); // pink-tinted background
  });
});
