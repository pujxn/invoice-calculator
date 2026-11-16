// Tiny byte strings that start like real image files, for tests.
const pad = (head, total = 64) =>
  Buffer.concat([head, Buffer.alloc(Math.max(0, total - head.length))]);

export const JPEG = pad(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]));
export const PNG = pad(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]));
export const WEBP = pad(
  Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 ')]),
);
export const heic = (brand = 'heic') =>
  pad(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp'), Buffer.from(brand)]));
export const TEXT = Buffer.from('this is definitely not a picture, just some text in a file');
export const PDF = pad(Buffer.from('%PDF-1.7\n'));
export const GIF = pad(Buffer.from('GIF89a'));
export const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
);
