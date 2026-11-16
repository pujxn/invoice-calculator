import { createHash } from 'node:crypto';

// Offline stand-in for the AI. It never looks at the picture: the amounts come from a hash of
// the picture's bytes, so the same file always gives the same answer and different files
// differ. Handy for trying the whole app without a key, and for tests.
const SHOPS = ['Lighting', 'Cabling', 'Labour', 'Delivery', 'Parts', 'Fixings', 'Call-out'];

const money = (cents) => `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

export function createMockProvider() {
  return {
    name: 'mock',
    model: 'mock',
    async extract({ fingerprint }) {
      const h = createHash('sha256').update(fingerprint).digest();
      const pick = (i, max) => (h[i] * 256 + h[i + 1]) % max;

      const debitLines = [0, 1, 2].map((n) => ({
        description: SHOPS[pick(n * 2, SHOPS.length)],
        column: 'debit',
        cents: 1000 + pick(8 + n * 2, 90000),
      }));
      const creditLines = [0, 1].map((n) => ({
        description: `Payment ${n + 1}`,
        column: 'credit',
        cents: 500 + pick(16 + n * 2, 40000),
      }));
      const sum = (lines) => lines.reduce((t, l) => t + l.cents, 0);

      return {
        readable: true,
        debit: money(sum(debitLines)),
        credit: money(sum(creditLines)),
        currency: 'GBP',
        confidence: 'high',
        notes:
          'Demo values from mock mode: your picture was not read by an AI. ' +
          'Set ANTHROPIC_API_KEY on the server to read real invoices.',
        line_items: [...debitLines, ...creditLines].map((l) => ({
          description: l.description,
          column: l.column,
          amount: money(l.cents),
        })),
      };
    },
  };
}
