// Normalises user input to E.164 (+ and 8 to 15 digits, first digit not 0).
// Spaces, dashes, dots and brackets are ignored. Returns null if invalid.
export function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  const cleaned = input.trim().replace(/[\s\-.()]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : null;
}
