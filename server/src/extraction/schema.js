import { ExtractionError } from './errors.js';

// What the vision model must return. The same shape is sent to the API as a JSON schema
// (structured output) and checked again here, because the model's answer is untrusted input.
const CONFIDENCE = ['high', 'medium', 'low'];
const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };

export const OUTPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['readable', 'debit', 'credit', 'confidence', 'notes'],
  properties: {
    readable: { type: 'boolean' },
    debit: nullableString,
    credit: nullableString,
    confidence: { type: 'string', enum: CONFIDENCE },
    notes: { type: 'string' },
  },
};

const bad = (why) =>
  new ExtractionError('bad_model_output', 'The AI gave an answer we could not use. Try again.', {
    status: 502,
    cause: new Error(`Model output rejected: ${why}`),
  });

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function checkKeys(obj, allowed, where) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) throw bad(`unexpected field "${where}${key}"`);
  }
  for (const key of allowed) {
    if (!(key in obj)) throw bad(`missing field "${where}${key}"`);
  }
}

const optionalString = (value, name, max) => {
  if (value === null) return null;
  if (typeof value !== 'string') throw bad(`${name} must be a string or null`);
  if (value.length > max) throw bad(`${name} is too long`);
  return value;
};

// Returns a clean copy of the model's answer or throws ExtractionError('bad_model_output').
export function validateModelOutput(raw) {
  if (!isObject(raw)) throw bad('not an object');
  checkKeys(raw, Object.keys(OUTPUT_JSON_SCHEMA.properties), '');

  if (typeof raw.readable !== 'boolean') throw bad('readable must be true or false');
  const debit = optionalString(raw.debit, 'debit', 40);
  const credit = optionalString(raw.credit, 'credit', 40);
  if (!CONFIDENCE.includes(raw.confidence)) throw bad('confidence is not high, medium or low');
  if (typeof raw.notes !== 'string' || raw.notes.length > 2000)
    throw bad('notes is not valid text');

  return {
    readable: raw.readable,
    debit,
    credit,
    confidence: raw.confidence,
    notes: raw.notes.trim(),
  };
}
