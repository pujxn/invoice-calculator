import { Router } from 'express';
import multer from 'multer';
import { detectImageType } from './fileType.js';
import { isValidId } from './store.js';
import { ExtractionError } from '../extraction/errors.js';
import { describeError } from '../log.js';

const MB = 1024 * 1024;

// Upload, fetch and delete invoice pictures. Every route needs a signed-in user and only ever
// touches that user's own files: another user's id behaves exactly like an id that does not exist.
export function createInvoiceRouter({
  store,
  requireAuth,
  maxBytes,
  extractor,
  extractLimiter,
  secrets = [],
}) {
  const router = Router();
  const reading = new Set(); // pictures being read right now, so one cannot be read twice at once
  const owner = (req) => req.session.phone;

  const parser = multer({
    storage: multer.memoryStorage(), // at most maxBytes per request; written out only once validated
    limits: { fileSize: maxBytes, files: 1, fields: 5, parts: 6 },
  }).single('image');

  const publicMeta = ({ id, mimeType, size, createdAt }) => ({
    id,
    mimeType,
    size,
    createdAt,
    imageUrl: `/api/invoices/${id}/image`,
  });

  // Reject obviously oversized requests before reading them, then parse the multipart body.
  function readUpload(req, res, next) {
    const declared = Number(req.get('content-length'));
    if (declared > maxBytes + 64 * 1024) {
      res.set('Connection', 'close');
      return res.status(413).json({ error: tooBig(maxBytes) });
    }
    parser(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: tooBig(maxBytes) });
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ error: 'Send the picture in a form field named "image".' });
      }
      if (
        err instanceof multer.MulterError ||
        /multipart|boundary|end of form|malformed/i.test(err.message)
      ) {
        return res.status(400).json({ error: 'The upload was not a valid picture upload.' });
      }
      next(err);
    });
  }

  router.post('/', requireAuth, readUpload, async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'Choose a picture to upload.' });
      if (file.size === 0) return res.status(400).json({ error: 'That file is empty.' });
      const type = detectImageType(file.buffer);
      if (!type) {
        return res.status(415).json({
          error: 'That file is not a JPEG, PNG, WebP or HEIC picture.',
        });
      }
      if ((await store.count(owner(req))) >= store.maxPerUser) {
        return res.status(429).json({
          error: `You can keep up to ${store.maxPerUser} pictures at once. Remove one and try again.`,
        });
      }
      const meta = await store.save(owner(req), file.buffer, type);
      res.status(201).json(publicMeta(meta));
    } catch (err) {
      next(err);
    }
  });

  // Unknown, malformed and other users' ids all answer 404, so ids cannot be probed.
  async function find(req, res, next) {
    try {
      const found = isValidId(req.params.id) && (await store.get(owner(req), req.params.id));
      if (!found) return res.status(404).json({ error: 'Invoice picture not found.' });
      req.invoice = found;
      next();
    } catch (err) {
      next(err);
    }
  }

  router.get('/:id', requireAuth, find, (req, res) => {
    res.json(publicMeta(req.invoice));
  });

  // The page cannot put a bearer token on an <img src>, so it fetches this and shows a blob.
  router.get('/:id/image', requireAuth, find, (req, res, next) => {
    res.set({
      'Content-Type': req.invoice.mimeType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline',
    });
    res.sendFile(req.invoice.file, (err) => err && next(err));
  });

  // Reads the Debit and Credit amounts from one of the user's pictures. On success the picture
  // is deleted (it is not needed any more); on failure it stays so the user can try again.
  router.post('/:id/extract', requireAuth, find, async (req, res, next) => {
    const key = `${owner(req)}:${req.invoice.id}`;
    if (reading.has(key)) {
      return res.status(409).json({ error: 'This picture is already being read.' });
    }
    const limit = extractLimiter.hit(owner(req));
    if (!limit.allowed) {
      res.set('Retry-After', String(limit.retryAfterSeconds));
      return res.status(429).json({
        error: 'You have read a lot of invoices in the last hour. Please try again later.',
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }
    reading.add(key);
    // If the browser goes away (cancel, closed tab), stop the AI call; nothing is deleted then.
    const abort = new AbortController();
    res.on('close', () => !res.writableEnded && abort.abort());
    try {
      const picture = await store.read(owner(req), req.invoice.id);
      const result = await extractor.extract(
        { data: picture.data, mimeType: picture.mimeType },
        { signal: abort.signal },
      );
      await store.remove(owner(req), picture.id);
      res.json({
        invoiceId: picture.id,
        provider: extractor.provider,
        model: extractor.model,
        imageDeleted: true,
        ...result,
      });
    } catch (err) {
      if (!(err instanceof ExtractionError)) return next(err);
      if (err.cause) console.error(`extract ${err.code}: ${describeError(err.cause, secrets)}`);
      if (err.retryAfterSeconds) res.set('Retry-After', String(err.retryAfterSeconds));
      if (!res.headersSent) {
        res.status(err.status).json({
          error: err.message,
          code: err.code,
          ...(err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
        });
      }
    } finally {
      reading.delete(key);
    }
  });

  router.delete('/:id', requireAuth, find, async (req, res, next) => {
    try {
      await store.remove(owner(req), req.invoice.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function tooBig(maxBytes) {
  const mb = maxBytes / MB;
  return `That picture is too big. The limit is ${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB.`;
}
