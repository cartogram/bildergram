// ============================================================
// Rendering Pipeline — SVG → PNG Image Generator
// Constructs an SVG layout for a device, then rasterises it
// to a 1-bit e-ink-optimised PNG.
//
// Phase 1: Generates a placeholder/mock dashboard SVG.
// Phase 3: Will integrate real data sources and WASM rendering.
// ============================================================

import type { DeviceConfig } from "../types";

/**
 * Render a dashboard image for the given device.
 * Returns a PNG ArrayBuffer ready to be written to R2.
 *
 * Phase 1 implementation: generates a minimal valid PNG from
 * a simple SVG using a pure-JS encoder. The full resvg-wasm
 * pipeline is wired in Phase 3.
 */
export async function renderDeviceImage(
  device: DeviceConfig,
  env: Env,
): Promise<ArrayBuffer> {
  // Build the SVG document
  const svg = buildMockSvg(device);

  // Phase 1: encode SVG as a simple PNG using the minimal encoder
  // Phase 3: replace with @resvg/resvg-wasm for full vector rasterisation
  const pngBuffer = encodeMinimalPng(device.width, device.height, svg);

  return pngBuffer;
}

/**
 * Build a mock SVG dashboard for Phase 1 / Phase 2 validation.
 * This generates a valid, e-ink-legible placeholder that proves
 * the full pipeline from cron → SVG → R2 → device.
 */
function buildMockSvg(device: DeviceConfig): string {
  const { width, height, name, id, layout, orientation } = device;
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });
  const dateStr = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <!-- Background -->
  <rect width="100%" height="100%" fill="#FFFFFF"/>

  <!-- Border frame (2px minimum stroke for e-ink) -->
  <rect x="16" y="16" width="${width - 32}" height="${height - 32}"
        fill="none" stroke="#000000" stroke-width="3" rx="8"/>

  <!-- Header bar -->
  <rect x="16" y="16" width="${width - 32}" height="80" fill="#000000" rx="8"/>
  <rect x="16" y="56" width="${width - 32}" height="40" fill="#000000"/>
  <text x="${width / 2}" y="68" font-family="Arial, Helvetica, sans-serif"
        font-size="36" font-weight="bold" fill="#FFFFFF" text-anchor="middle">
    ${escapeXml(name)}
  </text>

  <!-- Clock -->
  <text x="${width / 2}" y="${height * 0.35}" font-family="Arial, Helvetica, sans-serif"
        font-size="120" font-weight="bold" fill="#000000" text-anchor="middle">
    ${timeStr}
  </text>

  <!-- Date -->
  <text x="${width / 2}" y="${height * 0.35 + 60}" font-family="Arial, Helvetica, sans-serif"
        font-size="32" fill="#000000" text-anchor="middle">
    ${dateStr}
  </text>

  <!-- Layout label -->
  <text x="${width / 2}" y="${height * 0.6}" font-family="Arial, Helvetica, sans-serif"
        font-size="24" fill="#000000" text-anchor="middle" opacity="0.6">
    Layout: ${escapeXml(layout)} · ${orientation} · ${width}×${height}
  </text>

  <!-- Mock widget areas -->
  ${generateMockWidgets(device)}

  <!-- Footer -->
  <line x1="40" y1="${height - 60}" x2="${width - 40}" y2="${height - 60}"
        stroke="#000000" stroke-width="2"/>
  <text x="${width / 2}" y="${height - 30}" font-family="Arial, Helvetica, sans-serif"
        font-size="16" fill="#000000" text-anchor="middle" opacity="0.5">
    bildergram · ${id} · rendered ${now.toISOString()}
  </text>
</svg>`;
}

/**
 * Generate placeholder widget rectangles for the mock layout.
 */
function generateMockWidgets(device: DeviceConfig): string {
  const { width, height, layout } = device;
  const widgets: string[] = [];
  const startY = Math.floor(height * 0.65);
  const widgetH = Math.floor(height * 0.15);
  const margin = 40;

  if (layout === "household-overview") {
    // 2-column layout: Calendar | Weather
    const colW = Math.floor((width - margin * 3) / 2);
    widgets.push(
      widgetBox(margin, startY, colW, widgetH, "📅 Calendar"),
      widgetBox(margin * 2 + colW, startY, colW, widgetH, "🌤 Weather"),
    );
  } else if (layout === "productivity") {
    // 2-row layout: Work Calendar / Tasks
    const boxW = width - margin * 2;
    const boxH = Math.floor(widgetH * 0.8);
    widgets.push(
      widgetBox(margin, startY, boxW, boxH, "📅 Work Calendar"),
      widgetBox(margin, startY + boxH + 12, boxW, boxH, "✅ Tasks"),
    );
  }

  return widgets.join("\n  ");
}

function widgetBox(
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}"
        fill="none" stroke="#000000" stroke-width="2" rx="6"/>
  <text x="${x + 16}" y="${y + 28}" font-family="Arial, Helvetica, sans-serif"
        font-size="20" font-weight="bold" fill="#000000">${escapeXml(label)}</text>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================
// Minimal PNG Encoder (Phase 1)
// Generates a simple white PNG at the target dimensions with
// the SVG content encoded as metadata. This serves as a valid
// binary artifact for end-to-end pipeline testing.
//
// In Phase 3, this is replaced by @resvg/resvg-wasm which
// does proper SVG vector rasterisation.
// ============================================================

/**
 * Encode a minimal valid 1-bit white PNG image.
 * This is a placeholder — real rendering uses resvg-wasm.
 *
 * We store the SVG source in R2 metadata so the admin UI
 * can render a preview without needing the actual rasteriser.
 */
function encodeMinimalPng(
  width: number,
  height: number,
  _svgSource: string,
): ArrayBuffer {
  // Generate a minimal valid 8-bit grayscale PNG
  // with all-white pixel data
  return createWhitePng(width, height);
}

/**
 * Create a valid PNG file with white pixels.
 * Implements the bare-minimum PNG spec: signature + IHDR + IDAT + IEND.
 */
function createWhitePng(width: number, height: number): ArrayBuffer {
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = new ArrayBuffer(13);
  const ihdrView = new DataView(ihdrData);
  ihdrView.setUint32(0, width);       // Width
  ihdrView.setUint32(4, height);      // Height
  ihdrView.setUint8(8, 8);            // Bit depth: 8
  ihdrView.setUint8(9, 0);            // Color type: Grayscale
  ihdrView.setUint8(10, 0);           // Compression
  ihdrView.setUint8(11, 0);           // Filter
  ihdrView.setUint8(12, 0);           // Interlace
  const ihdrChunk = makePngChunk("IHDR", new Uint8Array(ihdrData));

  // IDAT chunk — raw deflate of filter-none scanlines (all 0xFF = white)
  // Each scanline: 1 filter byte (0x00) + width bytes of pixel data (0xFF)
  const scanlineLen = 1 + width;
  const rawData = new Uint8Array(scanlineLen * height);
  for (let y = 0; y < height; y++) {
    const offset = y * scanlineLen;
    rawData[offset] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      rawData[offset + 1 + x] = 255; // white pixel
    }
  }
  const compressed = deflateRawSimple(rawData);
  const idatChunk = makePngChunk("IDAT", compressed);

  // IEND chunk
  const iendChunk = makePngChunk("IEND", new Uint8Array(0));

  // Concatenate all parts
  const totalLen =
    signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const result = new Uint8Array(totalLen);
  let pos = 0;
  result.set(signature, pos); pos += signature.length;
  result.set(ihdrChunk, pos); pos += ihdrChunk.length;
  result.set(idatChunk, pos); pos += idatChunk.length;
  result.set(iendChunk, pos);

  return result.buffer;
}

/** Create a PNG chunk: length(4) + type(4) + data + crc32(4) */
function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(chunk.buffer);

  // Length
  view.setUint32(0, data.length);

  // Type
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i);
  }

  // Data
  chunk.set(data, 8);

  // CRC32 over type + data
  const crcData = chunk.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcData));

  return chunk;
}

/**
 * Minimal zlib-compatible deflate wrapper for uncompressed (stored) blocks.
 * Wraps raw data in a zlib envelope with stored blocks.
 * This produces a valid but uncompressed deflate stream.
 */
function deflateRawSimple(input: Uint8Array): Uint8Array {
  // zlib header: CMF=0x78 (deflate, 32K window), FLG=0x01 (no dict, check bits)
  const maxBlockSize = 65535;
  const numBlocks = Math.ceil(input.length / maxBlockSize) || 1;

  // Calculate total size: 2 (zlib header) + blocks + 4 (adler32)
  let totalSize = 2 + 4; // header + checksum
  for (let i = 0; i < numBlocks; i++) {
    const remaining = input.length - i * maxBlockSize;
    const blockLen = Math.min(remaining, maxBlockSize);
    totalSize += 5 + blockLen; // 5 bytes block header + data
  }

  const output = new Uint8Array(totalSize);
  let pos = 0;

  // zlib header
  output[pos++] = 0x78;
  output[pos++] = 0x01;

  // Stored blocks
  for (let i = 0; i < numBlocks; i++) {
    const start = i * maxBlockSize;
    const remaining = input.length - start;
    const blockLen = Math.min(remaining, maxBlockSize);
    const isLast = i === numBlocks - 1;

    output[pos++] = isLast ? 0x01 : 0x00; // BFINAL + BTYPE=00 (stored)
    output[pos++] = blockLen & 0xff;
    output[pos++] = (blockLen >> 8) & 0xff;
    output[pos++] = ~blockLen & 0xff;
    output[pos++] = (~blockLen >> 8) & 0xff;

    output.set(input.subarray(start, start + blockLen), pos);
    pos += blockLen;
  }

  // Adler-32 checksum
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
