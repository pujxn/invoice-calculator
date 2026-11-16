import { describe, expect, it } from 'vitest';
import { MAX_BYTES, formatSize, validateFile } from '../src/invoices/validate.js';

const file = (name, type, size = 1000) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('validateFile', () => {
  it('accepts JPEG, PNG, WebP and HEIC/HEIF', () => {
    for (const [name, type] of [
      ['a.jpg', 'image/jpeg'],
      ['a.png', 'image/png'],
      ['a.webp', 'image/webp'],
      ['a.heic', 'image/heic'],
      ['a.heif', 'image/heif'],
      ['A.JPG', 'IMAGE/JPEG'],
    ]) {
      expect(validateFile(file(name, type)), name).toBeNull();
    }
  });

  it('falls back to the extension when the browser reports no type (common for HEIC)', () => {
    expect(validateFile(file('IMG_0688.HEIC', ''))).toBeNull();
    expect(validateFile(file('notes.txt', ''))).toMatch(/not a JPEG, PNG, WebP or HEIC/);
  });

  it('rejects other types by name, even when the extension looks right', () => {
    expect(validateFile(file('invoice.pdf', 'application/pdf'))).toMatch(/not a JPEG/);
    expect(validateFile(file('a.gif', 'image/gif'))).toMatch(/not a JPEG/);
    expect(validateFile(file('a.svg', 'image/svg+xml'))).toMatch(/not a JPEG/);
    expect(validateFile(file('fake.jpg', 'text/plain'))).toMatch(/not a JPEG/);
  });

  it('rejects empty files and files over 10 MB, accepting exactly 10 MB', () => {
    expect(validateFile(file('a.png', 'image/png', 0))).toBe('That file is empty.');
    expect(validateFile(file('a.png', 'image/png', MAX_BYTES))).toBeNull();
    expect(validateFile(file('a.png', 'image/png', MAX_BYTES + 1))).toMatch(
      /10.0 MB\. The limit is 10 MB|The limit is 10 MB/,
    );
  });

  it('handles no file at all', () => {
    expect(validateFile(undefined)).toMatch(/Choose a picture/);
  });
});

describe('formatSize', () => {
  it('uses bytes, KB and MB', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(3.5 * 1024 * 1024)).toBe('3.5 MB');
  });
});
