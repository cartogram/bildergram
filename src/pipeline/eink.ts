// ============================================================
// E-Ink Bitmap Engine (Phase 3)
// Pure-JS PNG encoder for 1-bit grayscale output.
// ============================================================

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Encode a minimal 1-bit grayscale PNG (color type 0, bit depth 1).
 * Scanlines are unfiltered (filter 0) with pixels packed MSB-first.
 */
export function encodeGray1Png(width: number, height: number, bits: Uint8Array): ArrayBuffer {
  const bytesPerRow = Math.ceil(width / 8);
  const scanlineLen = 1 + bytesPerRow;
  const raw = new Uint8Array(scanlineLen * height);
  for (let y = 0; y < height; y++) {
    const row = y * scanlineLen;
    raw[row] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      if (bits[y * width + x]) {
        raw[row + 1 + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  const ihdrData = new ArrayBuffer(13);
  const ihdr = new DataView(ihdrData);
  ihdr.setUint32(0, width);       // Width
  ihdr.setUint32(4, height);      // Height
  ihdr.setUint8(8, 1);            // Bit depth: 1
  ihdr.setUint8(9, 0);            // Color type: Grayscale
  ihdr.setUint8(10, 0);           // Compression
  ihdr.setUint8(11, 0);           // Filter
  ihdr.setUint8(12, 0);           // Interlace
  const ihdrChunk = makePngChunk("IHDR", new Uint8Array(ihdrData));

  const idatChunk = makePngChunk("IDAT", deflateRawSimple(raw));
  const iendChunk = makePngChunk("IEND", new Uint8Array(0));

  const totalLen = SIGNATURE.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const out = new Uint8Array(totalLen);
  out.set(SIGNATURE, 0);
  let pos = SIGNATURE.length;
  out.set(ihdrChunk, pos); pos += ihdrChunk.length;
  out.set(idatChunk, pos); pos += idatChunk.length;
  out.set(iendChunk, pos);

  return out.buffer;
}

/** Create a PNG chunk: length(4) + type(4) + data + crc32(4) */
function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  const crcData = chunk.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcData));
  return chunk;
}

/**
 * Minimal zlib-compatible deflate wrapper for uncompressed (stored) blocks.
 * Wraps raw data in a zlib envelope with stored blocks.
 */
function deflateRawSimple(input: Uint8Array): Uint8Array {
  // zlib header: CMF=0x78 (deflate, 32K window), FLG=0x01 (no dict, check bits)
  const maxBlockSize = 65535;
  const numBlocks = Math.ceil(input.length / maxBlockSize) || 1;
  let totalSize = 2 + 4;
  for (let i = 0; i < numBlocks; i++) totalSize += 5 + Math.min(input.length - i * maxBlockSize, maxBlockSize);

  const output = new Uint8Array(totalSize);
  let pos = 0;
  output[pos++] = 0x78;
  output[pos++] = 0x01;
  for (let i = 0; i < numBlocks; i++) {
    const start = i * maxBlockSize;
    const remaining = input.length - start;
    const blockLen = Math.min(remaining, maxBlockSize);
    const isLast = i === numBlocks - 1;
    output[pos++] = isLast ? 0x01 : 0x00;
    output[pos++] = blockLen & 0xff;
    output[pos++] = (blockLen >> 8) & 0xff;
    output[pos++] = ~blockLen & 0xff;
    output[pos++] = (~blockLen >> 8) & 0xff;
    output.set(input.subarray(start, start + blockLen), pos);
    pos += blockLen;
  }
  const adler = adler32(input);
  output[pos++] = (adler >> 24) & 0xff;
  output[pos++] = (adler >> 16) & 0xff;
  output[pos++] = (adler >> 8) & 0xff;
  output[pos++] = adler & 0xff;
  return output;
}

/** Adler-32 checksum */
function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** CRC-32 (used by PNG chunks) */
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
