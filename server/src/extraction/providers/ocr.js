import { createRequire } from 'node:module';
import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import { ExtractionError } from '../errors.js';
import { decide, evidence, isSettled } from './ocrDecide.js';

// Free, offline reading of the invoice with Tesseract (tesseract.js: Tesseract compiled to
// WebAssembly, so there is nothing to install on the machine and no network call is made).
// The English language data ships inside the npm package @tesseract.js-data/eng, so the first
// reading needs no download either.
//
// The picture is cleaned up in up to three different ways and read once for each. The readings
// are compared (see ocrDecide.js); a number is only reported when it is proven or confirmed.

const PASSES = [
  {
    name: 'clean',
    psm: PSM.AUTO,
    prepare: (s) => s.greyscale().normalize().sharpen({ sigma: 1.2 }),
    width: 2000,
  },
  {
    // Local contrast: copes with uneven light and shadows on a photographed page.
    name: 'contrast',
    psm: PSM.SPARSE_TEXT,
    prepare: (s) =>
      s
        .greyscale()
        .clahe({ width: 64, height: 64, maxSlope: 3 })
        .normalize()
        .sharpen({ sigma: 1.5 }),
    width: 2400,
  },
  {
    // Bigger and harder contrast: for soft or small text.
    name: 'strong',
    psm: PSM.SPARSE_TEXT,
    prepare: (s) => s.greyscale().normalize().linear(1.5, -70).sharpen({ sigma: 2 }),
    width: 2800,
  },
];

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

// Resizes to a fixed width (small pictures are enlarged: OCR wants letters about 30 px tall).
async function prepareForPass(jpeg, pass, skew = 0) {
  const meta = await sharp(jpeg).metadata();
  const scale = Math.min(4, pass.width / Math.max(meta.width, meta.height));
  const resize = { width: Math.round(meta.width * scale), height: Math.round(meta.height * scale) };
  let source = sharp(jpeg)
    .rotate()
    .resize({ ...resize, kernel: 'lanczos3' });
  if (skew) source = sharp(await source.png().toBuffer()).rotate(skew, { background: '#ffffff' });
  return pass.prepare(source).png({ compressionLevel: 1 }).toBuffer();
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
export function createOcrProvider({ timeoutMs, engine, passes = PASSES } = {}) {
  engine ??= createOcrEngine({ timeoutMs });
  return {
    name: 'ocr',
    model: 'tesseract',
    close: () => engine.stop(),
    async extract({ image, signal }) {
      let readings = [];
      await engine.run(
        async (worker) => {
          // Reads one orientation of the picture with the given passes, stopping early once
          // both totals are proved.
          const read = async (jpeg, which) => {
            const skew = await estimateSkew(jpeg).catch(() => 0);
            const done = [];
            for (const pass of which) {
              const png = await prepareForPass(jpeg, pass, skew);
              await worker.setParameters({
                tessedit_pageseg_mode: pass.psm,
                preserve_interword_spaces: '1',
                user_defined_dpi: '300',
              });
              const { data } = await worker.recognize(png, {}, { blocks: true });
              done.push(wordsOf(data));
              if (isSettled(done)) break;
            }
            return done;
          };

          readings = await read(image.data, passes);
          // No amount found: the picture may be upside down or on its side (phones
          // usually record rotation, but screenshots and scans do not). Try the other
          // orientations with one quick pass each, and read fully in the first that works.
          const first = decide(readings);
          if (!first.readable || (first.debit === null && first.credit === null)) {
            let best = { turned: null, score: evidence(readings) };
            for (const turn of [180, 90, 270]) {
              const turned = await sharp(image.data).rotate(turn).jpeg({ quality: 92 }).toBuffer();
              const score = evidence(await read(turned, passes.slice(0, 1)));
              if (score > best.score) best = { turned, score };
            }
            if (best.turned) readings = await read(best.turned, passes);
          }
        },
        { signal },
      );
      return decide(readings);
    },
  };
}
