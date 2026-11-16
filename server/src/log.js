// Safe error logging. Errors from the SMS and AI providers can mention credentials (a rejected
// key is often echoed back), so nothing is logged as a raw object: only the error's name, status
// and message, with every configured secret and anything shaped like an API key blanked out.
const KEY_SHAPES = [/sk-ant-[A-Za-z0-9_-]+/g, /\bAC[0-9a-f]{32}\b/g, /\b[0-9a-f]{32}\b/g];

export function redact(text, secrets = []) {
  let out = String(text);
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 6) out = out.split(secret).join('[hidden]');
  }
  for (const shape of KEY_SHAPES) out = out.replace(shape, '[hidden]');
  return out;
}

// One line describing an error: "Name (status 401): message". Never includes headers, request
// bodies or stack traces from provider libraries.
export function describeError(err, secrets = []) {
  if (!(err instanceof Error)) return redact(String(err), secrets);
  const status = err.status ?? err.statusCode;
  const label = `${err.name || 'Error'}${status ? ` (status ${status})` : ''}`;
  return redact(`${label}: ${err.message}`, secrets);
}

// The settings that must never reach a log line.
export function secretsFrom(config) {
  return [
    config.vision?.anthropicKey,
    config.sms?.twilio?.authToken,
    config.sms?.twilio?.accountSid,
    config.auth?.secret,
  ].filter(Boolean);
}
