import { createClaudeProvider } from './providers/claude.js';
import { createMockProvider } from './providers/mock.js';
import { createOcrProvider } from './providers/ocr.js';
import { createFallbackProvider, USED_PROVIDER } from './providers/fallback.js';
import { ExtractionError } from './errors.js';
import { normalizeExtraction } from './normalize.js';
import { prepareImage } from './prepareImage.js';
import { validateModelOutput } from './schema.js';

const makeClaude = (visionConfig) =>
  createClaudeProvider({
    apiKey: visionConfig.anthropicKey,
    model: visionConfig.model,
    effort: visionConfig.effort,
    timeoutMs: visionConfig.timeoutMs,
    fallbacks: visionConfig.fallbacks,
  });

const makeOcr = (visionConfig) => createOcrProvider({ timeoutMs: visionConfig.ocr?.timeoutMs });

// Picks the vision provider named by config.vision.provider. Fails fast on a bad setup.
export function createVisionProvider(visionConfig) {
  switch (visionConfig.provider) {
    case 'mock':
      return createMockProvider();
    case 'ocr': {
      const ocr = makeOcr(visionConfig);
      return visionConfig.ocr?.fallbackToClaude && visionConfig.anthropicKey
        ? createFallbackProvider({ primary: ocr, secondary: makeClaude(visionConfig) })
        : ocr;
    }
    case 'claude':
      return makeClaude(visionConfig);
    default:
      throw new Error(
        `Unknown VISION_PROVIDER "${visionConfig.provider}" (use "ocr", "claude" or "mock")`,
      );
  }
}

// What the person sees in the "Read with" switch.
export const METHOD_LABELS = { ocr: 'Local OCR', claude: 'AI (Claude)', mock: 'Demo values' };

// Every way this server can read a picture, so the person can switch between them:
//   { default, methods: [{ id, label, available, reason?, provider? }] }
// "ocr" always works (it runs here, for free). "claude" needs ANTHROPIC_API_KEY; without one it is
// listed as unavailable with the reason, so the page can say so instead of failing later.
// "mock" (demo numbers, for tests) is offered alone: there is nothing to switch between.
export function createVisionMethods(visionConfig, { provider, methods: given } = {}) {
  if (given) return { default: given.find((m) => m.default)?.id ?? given[0].id, methods: given }; // tests
  if (provider) {
    // A ready-made provider (tests): the only method.
    return {
      default: provider.name,
      methods: [{ id: provider.name, label: provider.name, available: true, provider }],
    };
  }
  if (visionConfig.provider === 'mock') {
    return {
      default: 'mock',
      methods: [
        { id: 'mock', label: METHOD_LABELS.mock, available: true, provider: createMockProvider() },
      ],
    };
  }
  const hasKey = Boolean(visionConfig.anthropicKey);
  const ocr = createVisionProvider({ ...visionConfig, provider: 'ocr' });
  const methods = [
    { id: 'ocr', label: METHOD_LABELS.ocr, available: true, provider: ocr },
    hasKey
      ? {
          id: 'claude',
          label: METHOD_LABELS.claude,
          available: true,
          provider: makeClaude(visionConfig),
        }
      : {
          id: 'claude',
          label: METHOD_LABELS.claude,
          available: false,
          reason: 'AI reading is not set up on this server (no ANTHROPIC_API_KEY).',
        },
  ];
  if (visionConfig.provider === 'claude' && !hasKey) {
    // Same refusal as before: asking for AI without a key is a set-up mistake.
    makeClaude(visionConfig);
  }
  if (!['ocr', 'claude'].includes(visionConfig.provider)) createVisionProvider(visionConfig); // throws: unknown name
  return { default: visionConfig.provider, methods };
}

// The whole reading pipeline for one picture:
//   convert to a JPEG the model accepts -> ask the provider -> validate -> exact decimals.
// `provider` and `prepare` can be swapped in tests.
export function createExtractor({ provider, prepare = prepareImage }) {
  return {
    provider: provider.name,
    model: provider.model,
    async extract({ data, mimeType }, { signal } = {}) {
      const image = await prepare(data, mimeType);
      let raw;
      try {
        raw = await provider.extract({ image, fingerprint: data, signal });
      } catch (err) {
        if (err instanceof ExtractionError) throw err;
        throw new ExtractionError(
          'provider_unavailable',
          'The AI service had a problem. Please try again.',
          { status: 502, cause: err },
        );
      }
      const used = raw?.[USED_PROVIDER];
      const model = validateModelOutput(raw);
      if (!model.readable) {
        throw new ExtractionError(
          'unreadable_invoice',
          'We could not find an invoice in this picture. Try a clearer, well lit photo of the whole invoice.',
          { status: 422 },
        );
      }
      const result = normalizeExtraction(model);
      // When a second reader stepped in, say so (the route spreads these over its own).
      return used ? { ...result, provider: used.name, model: used.model } : result;
    },
  };
}
