// Regenerates every brand asset (SVG logos, favicon, PWA icons, Capacitor
// sources) from the palette below. Run: npm run brand
// The outlined "Ledgerly" wordmark path is read from client/public/brand/logo.svg,
// so the lettering stays the same and only colours and PNGs are rebuilt.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const brand = `${root}/client/public/brand`;
const assets = `${root}/client/assets`;

// Palette: pink, green, yellow, white, with a matching dark theme.
export const palette = {
  pink: '#C2185B', // primary, light theme
  pinkSoft: '#FFE3EE', // light tile used in the dark lockup
  white: '#FFFFFF',
  yellow: '#FFC83D', // credit bar on the pink tile
  gold: '#D99A00', // credit bar on the light tile
  ink: '#2B1020', // wordmark, light theme
  blush: '#FFF7FA', // light background
  night: '#1C0F16', // dark background
  inkOnDark: '#FBEAF1', // wordmark, dark theme
};

const wordmark = readFileSync(`${brand}/logo.svg`, 'utf8').match(/<path d="([^"]+)"/)[1];

const mark = (tile, bars, credit) =>
  `<g><rect width="64" height="64" rx="14" fill="${tile}"/>` +
  `<rect x="17" y="13" width="6" height="38" rx="1.5" fill="${bars}"/>` +
  `<rect x="29" y="17" width="23" height="7" rx="1.5" fill="${bars}"/>` +
  `<rect x="29" y="30" width="13" height="7" rx="1.5" fill="${credit}"/>` +
  `<rect x="17" y="45" width="35" height="6" rx="1.5" fill="${bars}"/></g>`;

const head = (w, desc) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 64" width="${w}" height="64" role="img" aria-labelledby="t d"><title id="t">Ledgerly</title><desc id="d">${desc}</desc>`;
const LOCKUP = 'Ledgerly logo: ledger mark followed by the word Ledgerly.';
const MARK =
  'Ledger mark: a vertical rule, a longer debit bar, a shorter credit bar and a total line.';

const p = palette;
const light = mark(p.pink, p.white, p.yellow);
const dark = mark(p.pinkSoft, p.pink, p.gold);

const svgs = {
  logo: `${head(253, LOCKUP)}${light}<path d="${wordmark}" fill="${p.ink}"/></svg>\n`,
  'logo-dark': `${head(253, LOCKUP)}${dark}<path d="${wordmark}" fill="${p.inkOnDark}"/></svg>\n`,
  'logo-mark': `${head(64, MARK)}${light}</svg>\n`,
  'logo-mark-dark': `${head(64, MARK)}${dark}</svg>\n`,
  // Favicon: chunkier bars so the mark survives at 16px. No title; it is decoration.
  favicon:
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${p.pink}"/>` +
    `<rect x="15" y="11" width="8" height="42" rx="2" fill="#fff"/><rect x="29" y="15" width="24" height="9" rx="2" fill="#fff"/>` +
    `<rect x="29" y="29" width="14" height="9" rx="2" fill="${p.yellow}"/><rect x="15" y="44" width="38" height="9" rx="2" fill="#fff"/></svg>\n`,
};
for (const [name, svg] of Object.entries(svgs)) writeFileSync(`${brand}/${name}.svg`, svg);

// Bars only (no tile), centred on a size x size canvas at the given scale.
const bars = (size, scale, credit = p.yellow) => {
  const x = size / 2 - 34.5 * scale;
  const y = size / 2 - 32 * scale;
  return (
    `<g transform="translate(${x} ${y}) scale(${scale})">` +
    `<rect x="17" y="13" width="6" height="38" rx="1.5" fill="#fff"/><rect x="29" y="17" width="23" height="7" rx="1.5" fill="#fff"/>` +
    `<rect x="29" y="30" width="13" height="7" rx="1.5" fill="${credit}"/><rect x="17" y="45" width="35" height="6" rx="1.5" fill="#fff"/></g>`
  );
};
const page = (size, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>`;
const flat = (size, fill) => `<rect width="${size}" height="${size}" fill="${fill}"/>`;
const lockupOn = (size, bg, mk, ink) => {
  const s = (size * 0.3627) / 253; // lockup is about 36% of the splash width
  const w = 253 * s;
  return page(
    size,
    `${flat(size, bg)}<g transform="translate(${(size - w) / 2} ${(size - 64 * s) / 2}) scale(${s})">${mk}<path d="${wordmark}" fill="${ink}"/></g>`,
  );
};

const png = {
  [`${brand}/favicon-32.png`]: [32, true, svgs.favicon],
  [`${brand}/icon-192.png`]: [192, true, svgs['logo-mark'].replace(/ width="64" height="64"/, '')],
  [`${brand}/icon-512.png`]: [512, true, svgs['logo-mark'].replace(/ width="64" height="64"/, '')],
  [`${brand}/apple-touch-icon.png`]: [180, false, page(180, flat(180, p.pink) + bars(180, 3.6))],
  [`${brand}/icon-maskable-512.png`]: [512, false, page(512, flat(512, p.pink) + bars(512, 6))],
  [`${assets}/icon-only.png`]: [1024, false, page(1024, flat(1024, p.pink) + bars(1024, 12))],
  [`${assets}/icon-foreground.png`]: [1024, true, page(1024, bars(1024, 12))],
  [`${assets}/icon-background.png`]: [1024, false, page(1024, flat(1024, p.pink))],
  [`${assets}/splash.png`]: [2732, false, lockupOn(2732, p.blush, light, p.ink)],
  [`${assets}/splash-dark.png`]: [2732, false, lockupOn(2732, p.night, dark, p.inkOnDark)],
};

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
for (const [file, [size, transparent, svg]] of Object.entries(png)) {
  const ctx = await browser.newContext({ viewport: { width: size, height: size } });
  const tab = await ctx.newPage();
  const sized = svg.replace(/<svg ([^>]*?)>/, (m, a) =>
    /width=/.test(a) ? m : `<svg ${a} width="${size}" height="${size}">`,
  );
  await tab.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${sized}`,
  );
  await tab.screenshot({ path: file, omitBackground: transparent });
  await ctx.close();
}
// Preview sheet for docs and reviews: lockups and marks at several sizes, light and dark.
const panel = (bg, lockup, markSvg) =>
  `<div style="background:${bg};width:900px;height:520px;position:relative">` +
  `<div style="position:absolute;left:60px;top:60px;width:720px">${lockup.replace(/ width="253" height="64"/, ' width="720"')}</div>` +
  `<div style="position:absolute;left:60px;top:278px;display:flex;align-items:flex-end;gap:16px">` +
  [192, 64, 32]
    .map(
      (n) =>
        `<div style="width:${n}px">${markSvg.replace(/ width="64" height="64"/, ` width="${n}" height="${n}"`)}</div>`,
    )
    .join('') +
  `</div></div>`;
const sheet = await browser.newPage({ viewport: { width: 1800, height: 520 } });
await sheet.setContent(
  `<body style="margin:0;display:flex">${panel('#fff', svgs.logo, svgs['logo-mark'])}${panel(p.night, svgs['logo-dark'], svgs['logo-mark-dark'])}</body>`,
);
await sheet.screenshot({ path: `${root}/docs/brand/logo-preview.png` });
await browser.close();
console.log(`Wrote ${Object.keys(svgs).length} SVGs and ${Object.keys(png).length} PNGs.`);
