import { LIMITS } from './model';

export async function inspectImage(blob: Blob) {
  if (blob.size > LIMITS.imageBytes)
    throw new Error('A imagem excede 20 MiB. Reduza o arquivo antes de importar.');
  const bytes = new Uint8Array(await blob.arrayBuffer()),
    view = new DataView(bytes.buffer);
  const ascii = (at: number, length: number) => String.fromCharCode(...bytes.slice(at, at + length));
  let width = 0,
    height = 0,
    mime: 'image/png' | 'image/jpeg' | 'image/webp';
  if (bytes.length > 24 && view.getUint32(0) === 0x89504e47 && ascii(12, 4) === 'IHDR') {
    mime = 'image/png';
    width = view.getUint32(16);
    height = view.getUint32(20);
    for (let at = 8; at + 12 <= bytes.length;) {
      const length = view.getUint32(at);
      if (ascii(at + 4, 4) === 'acTL')
        throw new Error('Use uma imagem estática. PNG animado não é suportado.');
      at += length + 12;
    }
  } else if (bytes.length > 12 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    mime = 'image/webp';
    for (let at = 12; at + 8 <= bytes.length;) {
      const length = view.getUint32(at + 4, true),
        name = ascii(at, 4),
        start = at + 8;
      if (start + length > bytes.length) throw new Error('Arquivo WebP incompleto.');
      if (name === 'ANIM' || (name === 'VP8X' && bytes[start] & 2))
        throw new Error('Use uma imagem estática. WebP animado não é suportado.');
      if (name === 'VP8X' && length >= 10) {
        width = 1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16);
        height = 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16);
      }
      if (!width && name === 'VP8 ' && length >= 10) {
        width = view.getUint16(start + 6, true) & 0x3fff;
        height = view.getUint16(start + 8, true) & 0x3fff;
      }
      if (!width && name === 'VP8L' && length >= 5) {
        const bits = view.getUint32(start + 1, true);
        width = (bits & 0x3fff) + 1;
        height = ((bits >>> 14) & 0x3fff) + 1;
      }
      at = start + length + (length % 2);
    }
  } else if (bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216) {
    mime = 'image/jpeg';
    let at = 2;
    while (at + 4 < bytes.length) {
      if (bytes[at++] !== 255) continue;
      while (bytes[at] === 255) at++;
      const marker = bytes[at++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = view.getUint16(at);
      if (length < 2 || at + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        height = view.getUint16(at + 3);
        width = view.getUint16(at + 5);
        break;
      }
      at += length;
    }
  } else throw new Error('Formato não suportado. Escolha PNG, JPEG ou WebP estático.');
  if (!width || !height) throw new Error('Não foi possível ler as dimensões da imagem.');
  if (width * height > LIMITS.imagePixels)
    throw new Error('A imagem excede 32 megapixels. Reduza suas dimensões antes de importar.');
  return { width, height, mime };
}
