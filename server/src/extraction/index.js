import { createClaudeProvider } from './providers/claude.js';
import { createMockProvider } from './providers/mock.js';
import { ExtractionError } from './errors.js';
import { normalizeExtraction } from './normalize.js';
import { prepareImage } from './prepareImage.js';
import { validateModelOutput } from './schema.js';

// Picks the vision provider named by config.vision.provider. Fails fast on a bad setup.
export function createVisionProvider(visionConfig) {
  switch (visionConfig.provider) {
    case 'mock':
      return createMockProvider();
    case 'claude':
      return createClaudeProvider({
        apiKey: visionConfig.anthropicKey,
        model: visionConfig.model,
        effort: visionConfig.effort,
        timeoutMs: visionConfig.timeoutMs,
        fallbacks: visionConfig.fallbacks,
      });
    default:
      throw new Error(
        `Unknown VISION_PROVIDER "${visionConfig.provider}" (use "claude" or "mock")`,
      );
  }
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
      const model = validateModelOutput(raw);
      if (!model.readable) {
        throw new ExtractionError(
          'unreadable_invoice',
          'We could not find an invoice in this picture. Try a clearer, well lit photo of the whole invoice.',
          { status: 422 },
        );
      }
      return normalizeExtraction(model);
    },
  };
}
