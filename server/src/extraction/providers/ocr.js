import { createRequire } from 'node:module';
import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import { ExtractionError } from '../errors.js';
import { amountBoxes, decide, evidence, isSettled } from './ocrDecide.js';
import { binarize, cleanedPage, encodePng, findPaper, greyPixels } from './ocrImage.js';

// Free, offline reading of the invoice with Tesseract (tesseract.js: Tesseract compiled to
// WebAssembly, so there is nothing to install on the machine and no network call is made).
// The English language data ships inside the npm package @tesseract.js-data/eng, so the first
// reading needs no download either.
//
// How a picture is read:
//   1. find the page in the photo and cut away the desk around it; straighten a tilted page;
//   2. read the whole page up to five times, each time cleaned up differently (see PASSES), and
//      stop early once two readings agree on both amounts;
//   3. take a close-up of each amount found and read it three more ways, digits only;
//   4. compare everything (ocrDecide.js): a number is only filled in when separate readings agree
//      on it, and it is flagged "high" only when every reading agrees.

export const PASSES = [
  {
    name: 'clean',
    psm: PSM.AUTO,
    prepare: (png) => sharp(png).greyscale().normalize().sharpen({ sigma: 1.2 }).png().toBuffer(),
    width: 2000,
  },
  {
    // Even light, ruled lines rubbed out: for photos, shadows and lined paper.
    name: 'flat',
    psm: PSM.SPARSE_TEXT,
    prepare: async (png) =>
      sharp(await encodePng(await cleanedPage(png)))
        .normalize()
        .sharpen({ sigma: 1.5 })
        .png()
        .toBuffer(),
    width: 2000,
  },
  {
    // The same, as pure black and white: for faint pen and soft focus.
    name: 'binary',
    psm: PSM.SPARSE_TEXT,
    prepare: async (png) => {
      const page = await cleanedPage(png);
      const sharpened = await greyPixels(
        await sharp(await encodePng(page))
          .sharpen({ sigma: 1.5 })
          .png()
          .toBuffer(),
      );
      return encodePng(binarize(sharpened));
    },
    width: 2000,
  },
  {
    // Local contrast: copes with uneven light and shadows on a photographed page.
    name: 'contrast',
    psm: PSM.SPARSE_TEXT,
    prepare: (png) =>
      sharp(png)
        .greyscale()
        .clahe({ width: 64, height: 64, maxSlope: 3 })
        .normalize()
        .sharpen({ sigma: 1.5 })
        .png()
        .toBuffer(),
    width: 2400,
  },
  {
    // Bigger and harder contrast: for soft or small text.
    name: 'strong',
    psm: PSM.SPARSE_TEXT,
    prepare: (png) =>
      sharp(png).greyscale().normalize().linear(1.5, -70).sharpen({ sigma: 2 }).png().toBuffer(),
    width: 2800,
  },
];

// Close-ups of one amount: the plain crop, evened out (ruled lines rubbed out), and black and white. Each gets a white
// border afterwards (Tesseract misses text that touches the edge).
const border = (png) =>
  sharp(png)
    .extend({ top: 24, bottom: 24, left: 24, right: 24, background: '#ffffff' })
    .png()
    .toBuffer();
const evenedOut = async (png) =>
  sharp(await encodePng(await cleanedPage(png)))
    .normalize()
    .png()
    .toBuffer();
const CLOSE_UPS = [
  async (png) => border(await sharp(png).greyscale().normalize().png().toBuffer()),
  async (png) => border(await evenedOut(png)),
  async (png) => border(await encodePng(binarize(await greyPixels(await evenedOut(png))))),
];
// Close-ups are scaled so the digits are about this tall (Tesseract reads 30 to 40 px best).
const CLOSE_UP_TEXT_PX = 44;

const fail = (code, message, status, cause, extra = {}) =>
  new ExtractionError(code, message, { status, cause, ...extra });

// Where the English data is. Resolved here (not at import) so a missing package gives a clear error.
export function bundledLangPath() {
  const data = createRequire(import.meta.url)('@tesseract.js-data/eng');
  return { langPath: data.langPath, gzip: data.gzip };
}

// How many degrees the page is tilted, found by trying small turns of a thumbnail and keeping
// the one where the lines of text are sharpest (rows alternate most between ink and paper).
// Tilt matters because a label and its amount at opposite ends of a row stop lining up.
export async function estimateSkew(jpeg) {
  const base = sharp(jpeg)
    .rotate()
    .greyscale()
    .normalize()
    .resize({ width: 640, withoutEnlargement: true });
  const thumb = await base.png().toBuffer();
  const size = await sharp(thumb).metadata();
  // Score only the middle of the turned thumbnail, so the new corners never count.
  const crop = {
    width: Math.floor(size.width * 0.7),
    height: Math.floor(size.height * 0.7),
  };
  async function score(angle) {
    const turned = await sharp(thumb).rotate(angle, { background: '#808080' }).png().toBuffer();
    const meta = await sharp(turned).metadata();
    const { data, info } = await sharp(turned)
      .extract({
        left: Math.floor((meta.width - crop.width) / 2),
        top: Math.floor((meta.height - crop.height) / 2),
        ...crop,
      })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height } = info; // one channel after greyscale
    const rows = new Float64Array(height);
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let x = 0; x < width; x++) sum += data[y * width + x];
      rows[y] = sum / width;
    }
    let total = 0;
    for (let y = 1; y < height; y++) total += (rows[y] - rows[y - 1]) ** 2;
    return total;
  }
  let best = { angle: 0, score: await score(0) };
  const baseline = best.score;
  const tryAngles = async (angles) => {
    for (const angle of angles) {
      const s = await score(angle);
      if (s > best.score) best = { angle, score: s };
    }
  };
  await tryAngles([-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6]);
  const centre = best.angle;
  await tryAngles([-0.75, -0.5, -0.25, 0.25, 0.5, 0.75].map((d) => centre + d));
  // Only turn the page when it clearly helps; a straight page must stay untouched.
  return Math.abs(best.angle) >= 0.4 && best.score > baseline * 1.05 ? best.angle : 0;
}

// The page, ready for reading: the desk around a photographed page cut away, the right way up
// and straightened. Returned as a PNG at the picture's own size.
export async function preparePage(jpeg) {
  let png = await sharp(jpeg).rotate().png().toBuffer();
  // Straighten first (measured on the whole picture), so the page is square to the edges and
  // can then be cut out tightly.
  const skew = await estimateSkew(png).catch(() => 0);
  if (skew) png = await sharp(png).rotate(skew, { background: '#ffffff' }).png().toBuffer();
  const paper = await findPaper(png).catch(() => null);
  if (paper) png = await sharp(png).extract(paper).png().toBuffer();
  const { width, height } = await sharp(png).metadata();
  return { png, width, height };
}

// Resizes to a fixed width (small pictures are enlarged: OCR wants letters about 30 px tall).
async function prepareForPass(page, pass) {
  const scale = Math.min(4, pass.width / Math.max(page.width, page.height));
  const resized = await sharp(page.png)
    .resize({
      width: Math.round(page.width * scale),
      height: Math.round(page.height * scale),
      kernel: 'lanczos3',
    })
    .png()
    .toBuffer();
  return { png: await pass.prepare(resized), scale };
}

// A close-up of one amount: its box with some room around it, enlarged so the digits are a good
// size.
async function closeUpOf(page, box) {
  const h = box.y1 - box.y0;
  // Some room on both sides (OCR sometimes misses an end digit), but not into the word in front.
  const left = Math.max(0, Math.floor(box.x0 - 1.5 * h), Math.ceil(box.minX ?? 0));
  const top = Math.max(0, Math.floor(box.y0 - 0.5 * h));
  const right = Math.min(page.width, Math.ceil(box.x1 + 1.5 * h));
  const bottom = Math.min(page.height, Math.ceil(box.y1 + 0.5 * h));
  if (right - left < 4 || bottom - top < 4) return null;
  const scale = Math.min(6, Math.max(0.5, CLOSE_UP_TEXT_PX / Math.max(1, h)));
  return sharp(page.png)
    .extract({ left, top, width: right - left, height: bottom - top })
    .resize({ width: Math.max(8, Math.round((right - left) * scale)), kernel: 'lanczos3' })
    .png()
    .toBuffer();
}

// Words (with boxes) out of an OCR result, whatever nesting the engine used.
function wordsOf(data) {
  const words = [];
  for (const block of data.blocks ?? [])
    for (const para of block.paragraphs ?? [])
      for (const line of para.lines ?? []) for (const w of line.words ?? []) words.push(w);
  return words;
}

// One shared OCR worker, started on first use and stopped after it has been idle for a while,
// so an idle server holds no memory for it. Readings run one at a time; a few can wait.
export function createOcrEngine({
  timeoutMs = 45_000,
  idleMs = 60_000,
  maxWaiting = 6,
  lang = bundledLangPath(),
  makeWorker = createWorker,
} = {}) {
  let worker = null;
  let starting = null;
  let idleTimer = null;
  let chain = Promise.resolve();
  let waiting = 0;

  const stop = async () => {
    clearTimeout(idleTimer);
    const w = worker ?? (await starting?.catch(() => null));
    worker = null;
    starting = null;
    await w?.terminate().catch(() => {});
  };

  const start = () => {
    starting ??= makeWorker('eng', 1, {
      langPath: lang.langPath,
      gzip: lang.gzip,
      cacheMethod: 'none', // read the bundled file every time; never write a cache or download
      errorHandler: () => {}, // failures surface through the rejected call
    }).then((w) => {
      worker = w;
      return w;
    });
    return starting;
  };

  // Runs `job(worker)` alone on the worker. Past `timeoutMs`, or when `signal` aborts, the worker
  // is killed (an OCR call cannot be interrupted any other way) and restarted on the next call.
  async function run(job, { signal } = {}) {
    if (waiting >= maxWaiting) {
      throw fail(
        'rate_limited',
        'Reading is busy right now. Please try again in a moment.',
        429,
        undefined,
        {
          retryAfterSeconds: 10,
        },
      );
    }
    waiting += 1;
    const turn = chain.then(
      () => {},
      () => {},
    );
    let release;
    chain = new Promise((r) => (release = r));
    try {
      await turn;
      if (signal?.aborted) throw fail('cancelled', 'Reading was cancelled.', 499);
      clearTimeout(idleTimer);
      let timer;
      let onAbort;
      const interrupted = new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(fail('timeout', 'Reading the invoice took too long. Please try again.', 504)),
          timeoutMs,
        );
        onAbort = () => reject(fail('cancelled', 'Reading was cancelled.', 499));
        signal?.addEventListener('abort', onAbort, { once: true });
      });
      try {
        return await Promise.race([start().then(job), interrupted]);
      } catch (err) {
        await stop(); // the worker may be stuck or half-way through a job
        if (err instanceof ExtractionError) throw err;
        throw fail(
          'provider_unavailable',
          'Reading the picture failed. Please try again.',
          502,
          err,
        );
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    } finally {
      waiting -= 1;
      release();
      clearTimeout(idleTimer);
      idleTimer = setTimeout(stop, idleMs);
      idleTimer.unref?.();
    }
  }

  return { run, stop };
}

// `engine` can be swapped in tests.
export function createOcrProvider({
  timeoutMs,
  engine,
  passes = PASSES,
  closeUpVariants = CLOSE_UPS,
} = {}) {
  engine ??= createOcrEngine({ timeoutMs });
  return {
    name: 'ocr',
    model: 'tesseract',
    close: () => engine.stop(),
    async extract({ image, signal }) {
      let readings = [];
      let closeUps = {};
      await engine.run(
        async (worker) => {
          const page = (psm, whitelist = '') =>
            worker.setParameters({
              tessedit_pageseg_mode: psm,
              tessedit_char_whitelist: whitelist,
              preserve_interword_spaces: '1',
              user_defined_dpi: '300',
            });

          // Reads one orientation of the picture with the given passes, stopping early once
          // two readings agree on both amounts.
          const read = async (prepared, which) => {
            const done = [];
            for (const pass of which) {
              const { png, scale } = await prepareForPass(prepared, pass);
              await page(pass.psm);
              const { data } = await worker.recognize(png, {}, { blocks: true });
              done.push({ words: wordsOf(data), scale });
              if (isSettled(done)) break;
            }
            return done;
          };

          let prepared = await preparePage(image.data);
          readings = await read(prepared, passes);
          // No amount found: the picture may be upside down or on its side (phones
          // usually record rotation, but screenshots and scans do not). Try the other
          // orientations with one quick pass each, and read fully in the first that works.
          const first = decide(readings);
          if (!first.readable || (first.debit === null && first.credit === null)) {
            let best = { turned: null, score: evidence(readings) };
            for (const turn of [180, 90, 270]) {
              const turned = await preparePage(
                await sharp(image.data).rotate(turn).jpeg({ quality: 92 }).toBuffer(),
              );
              const score = evidence(await read(turned, passes.slice(0, 1)));
              if (score > best.score) best = { turned, score };
            }
            if (best.turned) {
              prepared = best.turned;
              readings = await read(prepared, passes);
            }
          }

          // Close-ups of each amount, digits only.
          const boxes = amountBoxes(readings);
          for (const [field, box] of Object.entries(boxes)) {
            const crop = await closeUpOf(prepared, box);
            if (!crop) continue;
            await page(PSM.SINGLE_LINE, '0123456789.,/-');
            closeUps[field] = [];
            for (const make of closeUpVariants) {
              const { data } = await worker.recognize(await make(crop));
              closeUps[field].push({ text: data.text, conf: data.confidence });
            }
          }
        },
        { signal },
      );
      return decide(readings, closeUps);
    },
  };
}
