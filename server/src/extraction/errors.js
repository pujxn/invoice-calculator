// One error type for everything that can go wrong while reading an invoice. The route turns it
// into an HTTP response, so each error carries the status and a message safe to show the user.
export class ExtractionError extends Error {
  constructor(code, message, { status = 502, retryAfterSeconds, cause } = {}) {
    super(message, { cause });
    this.name = 'ExtractionError';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
