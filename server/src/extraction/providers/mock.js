import { createHash } from 'node:crypto';

// Offline stand-in for the AI. It never looks at the picture: the amounts come from a hash of
// the picture's bytes, so the same file always gives the same answer and different files
// differ. Handy for trying the whole app without a key, and for tests.
const money = (cents) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

export function createMockProvider() {
  return {
    name: 'mock',
    model: 'mock',
    async extract({ fingerprint }) {
      const h = createHash('sha256').update(fingerprint).digest();
      const pick = (i, max) => (h[i] * 256 + h[i + 1]) % max;

      const debit = 1000 + pick(0, 400000);
      const credit = 500 + pick(2, 150000);

      return {
        readable: true,
        debit: money(debit),
        credit: money(credit),
        confidence: 'high',
        notes:
          'Demo values from mock mode: your picture was not read by an AI. ' +
          'Set ANTHROPIC_API_KEY on the server to read real invoices.',
      };
    },
  };
}
