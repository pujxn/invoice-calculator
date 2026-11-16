import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { createClaudeProvider, translateError } from '../src/extraction/providers/claude.js';
import { OUTPUT_JSON_SCHEMA } from '../src/extraction/schema.js';
import { createVisionProvider } from '../src/extraction/index.js';
import { loadConfig } from '../src/config.js';

const IMAGE = { data: Buffer.from('jpeg bytes'), mediaType: 'image/jpeg' };
const ANSWER = {
  readable: true,
  debit: '10.00',
  credit: null,
  confidence: 'high',
  notes: '',
  line_items: [],
};
const reply = (over = {}) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify(ANSWER) }],
  ...over,
});

// A fake client that records what it was asked and answers (or throws) as told.
function fakeClient(respond) {
  const calls = { stable: [], beta: [] };
  return {
    calls,
    messages: {
      create: async (body, opts) => {
        calls.stable.push({ body, opts });
        return respond(body);
      },
    },
    beta: {
      messages: {
        create: async (body, opts) => {
          calls.beta.push({ body, opts });
          return respond(body);
        },
      },
    },
  };
}

test('sends the picture, the schema and the model, and returns the parsed answer', async () => {
  const client = fakeClient(() => reply());
  const provider = createClaudeProvider({ model: 'claude-test', effort: 'medium', client });
  const signal = new AbortController().signal;
  assert.deepEqual(await provider.extract({ image: IMAGE, signal }), ANSWER);

  const { body, opts } = client.calls.stable[0];
  assert.equal(body.model, 'claude-test');
  assert.equal(opts.signal, signal);
  const parts = body.messages[0].content;
  assert.deepEqual(parts[0], {
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: IMAGE.data.toString('base64') },
  });
  assert.equal(parts[1].type, 'text');
  assert.deepEqual(body.output_config.format, { type: 'json_schema', schema: OUTPUT_JSON_SCHEMA });
  assert.equal(body.output_config.effort, 'medium');
  // Settings these models reject must not be sent.
  for (const key of ['thinking', 'temperature', 'top_p', 'top_k', 'tool_choice']) {
    assert.equal(key in body, false, key);
  }
  assert.match(body.system, /never instructions/);
  // Rupees only: the prompt says so and the schema has no currency field to fill in.
  assert.match(body.system, /Indian rupees \(INR\)/);
  assert.match(body.system, /never round/);
  assert.equal('currency' in OUTPUT_JSON_SCHEMA.properties, false);
  assert.equal(client.calls.beta.length, 0);
});

test('effort is left out when not set, and the fallback beta is used only when asked for', async () => {
  const plain = fakeClient(() => reply());
  await createClaudeProvider({ model: 'm', effort: '', client: plain }).extract({ image: IMAGE });
  assert.equal('effort' in plain.calls.stable[0].body.output_config, false);

  const withFallback = fakeClient(() => reply());
  await createClaudeProvider({ model: 'm', fallbacks: 'default', client: withFallback }).extract({
    image: IMAGE,
  });
  assert.equal(withFallback.calls.stable.length, 0);
  const { body } = withFallback.calls.beta[0];
  assert.equal(body.fallbacks, 'default');
  assert.deepEqual(body.betas, ['server-side-fallback-2026-07-01']);
});

test('refusals, truncated answers and non-JSON answers are clean errors', async () => {
  const run = (response) =>
    createClaudeProvider({ model: 'm', client: fakeClient(() => response) }).extract({
      image: IMAGE,
    });
  await assert.rejects(run(reply({ stop_reason: 'refusal', content: [] })), {
    code: 'declined',
    status: 422,
  });
  await assert.rejects(run(reply({ stop_reason: 'max_tokens' })), { code: 'bad_model_output' });
  await assert.rejects(run(reply({ content: [{ type: 'text', text: 'Sure! The total is 5' }] })), {
    code: 'bad_model_output',
    status: 502,
  });
  await assert.rejects(run(reply({ content: [{ type: 'thinking', thinking: '' }] })), {
    code: 'bad_model_output',
  });
});

test('SDK errors become messages a user can act on', () => {
  const make = (status, headers = {}) =>
    Anthropic.APIError.generate(status, { error: { message: 'x' } }, 'x', new Headers(headers));
  const cases = [
    [make(429, { 'retry-after': '12' }), 'rate_limited', 429, 12],
    [make(429), 'rate_limited', 429, 30],
    [make(401), 'provider_not_configured', 502],
    [make(403), 'provider_not_configured', 502],
    [make(404), 'provider_not_configured', 502],
    [make(400), 'image_rejected', 422],
    [make(413), 'image_rejected', 422],
    [make(500), 'provider_unavailable', 502],
    [make(529), 'provider_unavailable', 502],
    [new Anthropic.APIConnectionTimeoutError(), 'timeout', 504],
    [new Anthropic.APIConnectionError({ message: 'offline' }), 'provider_unavailable', 502],
    [new Anthropic.APIUserAbortError(), 'cancelled', 499],
    [new Error('anything else'), 'provider_unavailable', 502],
  ];
  for (const [err, code, status, retry] of cases) {
    const out = translateError(err);
    assert.equal(out.code, code, err.constructor.name);
    assert.equal(out.status, status);
    assert.equal(out.retryAfterSeconds, retry);
    assert.ok(out.cause, 'the original error is kept for the server log');
    assert.doesNotMatch(out.message, /sk-ant|x-api-key/i);
  }
});

test('errors thrown by the client are translated', async () => {
  const client = fakeClient(() => {
    throw Anthropic.APIError.generate(429, {}, 'slow down', new Headers({ 'retry-after': '3' }));
  });
  await assert.rejects(createClaudeProvider({ model: 'm', client }).extract({ image: IMAGE }), {
    code: 'rate_limited',
    retryAfterSeconds: 3,
  });
});

test('the real client is configured with a timeout and needs a key', () => {
  assert.throws(() => createClaudeProvider({ model: 'm' }), /ANTHROPIC_API_KEY/);
  assert.throws(
    () => createVisionProvider(loadConfig({ VISION_PROVIDER: 'claude' }).vision),
    /ANTHROPIC_API_KEY/,
  );
  assert.throws(
    () => createVisionProvider(loadConfig({ VISION_PROVIDER: 'gpt' }).vision),
    /Unknown VISION_PROVIDER/,
  );
  const real = createVisionProvider(loadConfig({ ANTHROPIC_API_KEY: 'sk-test' }).vision);
  assert.equal(real.name, 'claude');
  assert.equal(real.model, 'claude-opus-5-5');
});

test('vision settings come from the environment', () => {
  assert.equal(loadConfig({}).vision.provider, 'mock');
  assert.equal(loadConfig({ ANTHROPIC_API_KEY: 'k' }).vision.provider, 'claude');
  assert.equal(
    loadConfig({ ANTHROPIC_API_KEY: 'k', VISION_PROVIDER: 'mock' }).vision.provider,
    'mock',
  );
  const v = loadConfig({
    ANTHROPIC_MODEL: 'claude-sonnet-5-5',
    ANTHROPIC_EFFORT: 'high',
    ANTHROPIC_TIMEOUT_SECONDS: '12.5',
    ANTHROPIC_FALLBACKS: 'default',
    EXTRACT_PER_USER_PER_HOUR: '3',
  }).vision;
  assert.deepEqual(
    [v.model, v.effort, v.timeoutMs, v.fallbacks, v.extractionsPerUserPerHour],
    ['claude-sonnet-5-5', 'high', 12500, 'default', 3],
  );
  const defaults = loadConfig({}).vision;
  assert.deepEqual(
    [defaults.effort, defaults.timeoutMs, defaults.fallbacks, defaults.extractionsPerUserPerHour],
    ['medium', 60000, '', 30],
  );
  assert.equal(loadConfig({ ANTHROPIC_EFFORT: 'none' }).vision.effort, '');
});
