import sharp from 'sharp';

// Picture clean-up for the free OCR reader (see ocr.js). Phone photos of invoices have a desk
// around the page, light that falls off across it, soft focus and, on ruled paper, printed lines
// running through the writing. Tesseract was made for flat black-on-white scans, so each of those
// is undone here before reading. Everything works on one-channel (grey) raw pixels.

// Grey raw pixels of a picture: { data, width, height }.
export async function greyPixels(input) {
  const { data, info } = await sharp(input).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const toPng = ({ data, width, height }) =>
  sharp(data, { raw: { width, height, channels: 1 } })
    .png({ compressionLevel: 1 })
    .toBuffer();

// Otsu's method: the grey level that best splits the picture into ink and paper.
export function otsu(data) {
  const hist = new Array(256).fill(0);
  for (const v of data) hist[v] += 1;
  const total = data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

// Where the page is in a photo: the biggest bright area. Returns a box in the picture's own pixels
// (with a small margin), or null when the page already fills the picture (a scan or screenshot)
// or no clear page stands out.
export async function findPaper(input) {
  const meta = await sharp(input).metadata();
  const thumbWidth = Math.min(320, meta.width);
  const { data, width, height } = await greyPixels(
    await sharp(input).resize({ width: thumbWidth }).blur(1).png().toBuffer(),
  );
  const t = otsu(data);
  const seen = new Uint8Array(width * height);
  let best = null;
  const stack = [];
  for (let start = 0; start < data.length; start++) {
    if (seen[start] || data[start] <= t) continue;
    let area = 0;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % width;
      const y = (i - x) / width;
      area += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      const next = [
        x > 0 && i - 1,
        x < width - 1 && i + 1,
        y > 0 && i - width,
        y < height - 1 && i + width,
      ];
      for (const n of next) {
        if (n !== false && !seen[n] && data[n] > t) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (!best || area > best.area) best = { area, x0, y0, x1, y1 };
  }
  if (!best) return null;
  const all = width * height;
  const boxArea = (best.x1 - best.x0 + 1) * (best.y1 - best.y0 + 1);
  // Too small to be the page, or already (nearly) the whole picture.
  if (best.area < 0.12 * all || boxArea > 0.85 * all) return null;
  const k = meta.width / width;
  // Cut slightly inside the page edge, so no desk or shadow is left along the sides.
  const margin = -0.015 * Math.max(best.x1 - best.x0, best.y1 - best.y0);
  const left = Math.max(0, Math.floor((best.x0 - margin) * k));
  const top = Math.max(0, Math.floor((best.y0 - margin) * k));
  const right = Math.min(meta.width, Math.ceil((best.x1 + 1 + margin) * k));
  const bottom = Math.min(meta.height, Math.ceil((best.y1 + 1 + margin) * k));
  return { left, top, width: right - left, height: bottom - top };
}

// Evens out the light: divides each pixel by the local paper brightness, found as the brightest
// value in each small tile (so the writing itself does not count), smoothed. A shadow across the
// page or a dim corner becomes the same white as the rest.
export async function flattenLight({ data, width, height }) {
  // Tiles bigger than any letter, so each one holds some bare paper.
  const tile = Math.max(16, Math.round(Math.max(width, height) / 10));
  const tw = Math.ceil(width / tile);
  const th = Math.ceil(height / tile);
  const bright = Buffer.alloc(tw * th);
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      let max = 0;
      for (let y = ty * tile; y < Math.min(height, (ty + 1) * tile); y++) {
        const row = y * width;
        for (let x = tx * tile; x < Math.min(width, (tx + 1) * tile); x++) {
          if (data[row + x] > max) max = data[row + x];
        }
      }
      bright[ty * tw + tx] = max;
    }
  }
  const background = await sharp(bright, { raw: { width: tw, height: th, channels: 1 } })
    .resize({ width, height, fit: 'fill', kernel: 'cubic' })
    .blur(tile / 3)
    .toColourspace('b-w') // stay one channel
    .raw()
    .toBuffer();
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    const bg = Math.max(background[i], 24);
    out[i] = Math.min(255, Math.round((data[i] * 255) / bg));
  }
  return { data: out, width, height };
}

// Rubs out long straight lines (ruled paper, table borders, underlines). They cut through
// handwriting and make the engine split or drop the words that sit on them.
// `threshold`: what counts as ink. The page has been evened out first, so paper is near white.
export function removeRuledLines({ data, width, height }, threshold = 150) {
  const out = Buffer.from(data);
  const minRunX = Math.max(40, Math.round(width * 0.18));
  const minRunY = Math.max(40, Math.round(height * 0.3));
  // A line is thin: a little above and below it (or either side) is mostly paper. This keeps
  // dark areas, such as a desk at the edge of a photo, from being taken for lines.
  const gap = Math.max(4, Math.round(Math.min(width, height) / 120));
  const light = (i) => data[i] > threshold;
  const thin = (count, at) => {
    let paper = 0;
    for (let k = 0; k < count; k++) if (at(k)) paper += 1;
    return paper >= 0.6 * count;
  };
  for (let y = gap; y < height - gap; y++) {
    let run = 0;
    for (let x = 0; x <= width; x++) {
      const dark = x < width && data[y * width + x] <= threshold;
      if (dark) {
        run += 1;
        continue;
      }
      const from = x - run;
      if (
        run >= minRunX &&
        thin(run, (k) => light((y - gap) * width + from + k)) &&
        thin(run, (k) => light((y + gap) * width + from + k))
      ) {
        for (let k = from; k < x; k++) out[y * width + k] = 255;
      }
      run = 0;
    }
  }
  for (let x = gap; x < width - gap; x++) {
    let run = 0;
    for (let y = 0; y <= height; y++) {
      const dark = y < height && data[y * width + x] <= threshold;
      if (dark) {
        run += 1;
        continue;
      }
      const from = y - run;
      if (
        run >= minRunY &&
        thin(run, (k) => light((from + k) * width + x - gap)) &&
        thin(run, (k) => light((from + k) * width + x + gap))
      ) {
        for (let k = from; k < y; k++) out[k * width + x] = 255;
      }
      run = 0;
    }
  }
  return { data: out, width, height };
}

// Pure black and white at the Otsu level.
export function binarize({ data, width, height }, threshold = otsu(data)) {
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] <= threshold ? 0 : 255;
  return { data: out, width, height };
}

// The page, flattened and with ruled lines removed, as grey pixels. Shared by the passes below.
export async function cleanedPage(png) {
  const flat = await flattenLight(await greyPixels(png));
  return removeRuledLines(flat);
}

export const encodePng = toPng;
