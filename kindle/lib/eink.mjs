// ============================================================
// kindle/lib/eink.mjs — image helpers for the Kindle Paperwhite 3
// Shared by kindle/build.mjs (Tempelhof, built locally) and the
// Vercel function api/kino.mjs (cinema listing, built on demand).
//
// Screens are drawn as SVG in landscape (W × H), rasterised with
// resvg, reduced to the panel's 16 gray levels, rotated into the
// 1072 × 1448 portrait framebuffer and written as 8-bit grayscale
// PNG — the only format `eips -g` pastes correctly.
// ============================================================

import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { deflateSync } from "node:zlib";
import { GLYPHS } from "./glyphs.ts";

export const W = 1448; // landscape width
export const H = 1072; // landscape height

/** Which way landscape is turned into the portrait framebuffer ("ccw" or "cw"). */
export const ROTATE = process.env.KINDLE_ROTATE ?? "ccw";

let fonts;
let ready;

/** Load resvg's WASM and the Arimo fonts (regular + bold) once per process. */
export function initRenderer() {
  ready ??= (async () => {
    const require = createRequire(import.meta.url);
    await initWasm(readFileSync(require.resolve("@resvg/resvg-wasm/index_bg.wasm")));
    fonts = ["Arimo.ttf", "Arimo-Bold.ttf"].map((f) => readFileSync(new URL(`../../assets/fonts/${f}`, import.meta.url)));
  })();
  return ready;
}

// ------------------------------------------------------------------
// SVG helpers
// ------------------------------------------------------------------

export const svgOpen = (w, h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fff"/>`;

export const escapeXml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

/**
 * Approximate rendered width of `text` in Arimo at `size` px, from the
 * advance widths in the bitmap glyph table (measured at 26 px). Good
 * enough to wrap and truncate; unknown characters count as an "n".
 */
export function textWidth(text, size) {
  let adv = 0;
  for (const ch of text) adv += GLYPHS[ch]?.adv ?? GLYPHS[ch.normalize("NFD")[0]]?.adv ?? GLYPHS.n.adv;
  return (adv * size) / 26;
}

/** Cut `text` with "…" so it fits `width`. */
function ellipsize(text, size, width) {
  let t = text;
  while (t && textWidth(`${t}…`, size) > width) t = t.slice(0, -1).trimEnd();
  return `${t}…`;
}

/** Split `text` into at most `maxLines` lines no wider than `width`; anything cut ends in "…". */
export function wrap(text, size, width, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let i = 0; // next word to place
  while (i < words.length && lines.length < maxLines) {
    let line = words[i++];
    while (i < words.length && textWidth(`${line} ${words[i]}`, size) <= width) line += ` ${words[i++]}`;
    lines.push(line);
  }
  const out = lines.map((l) => (textWidth(l, size) > width ? ellipsize(l, size, width) : l));
  if (i < words.length && !out[out.length - 1].endsWith("…")) {
    out[out.length - 1] = ellipsize(out[out.length - 1], size, width);
  }
  return out;
}

// ------------------------------------------------------------------
// Raster: SVG → 16-level gray → rotated → PNG
// ------------------------------------------------------------------

/**
 * Render SVG to 16-level gray. `width` scales the drawing to that many
 * pixels wide (e.g. a Paperwhite 2's 1024 for the 1448-wide design).
 */
export function rasterize(svg, { width } = {}) {
  const resvg = new Resvg(svg, {
    font: { fontBuffers: fonts, loadSystemFonts: false, defaultFontFamily: "Arimo" },
    ...(width ? { fitTo: { mode: "width", value: width } } : {}),
  });
  const img = resvg.render();
  const rgba = img.pixels; // a getter that copies out of WASM memory — read it once
  const w = img.width;
  const h = img.height;
  // Free the WASM-side objects now: garbage collection is too late for a
  // build of ~1000 full renders (WASM runs out of memory) or a long-lived
  // Vercel instance.
  img.free();
  resvg.free();
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    // Black-on-white art: any channel is the gray value. Quantize to
    // the panel's 16 levels so eips doesn't dither.
    gray[i] = Math.round(rgba[i * 4] / 17) * 17;
  }
  return { w, h, px: gray };
}

/** Rotate 90°: "ccw" maps landscape (x, y) → portrait (y, w-1-x). */
export function rotate(img, dir = ROTATE) {
  const { w, h, px } = img;
  const out = new Uint8Array(w * h);
  const ccw = dir === "ccw";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = ccw ? y : h - 1 - y;
      const ny = ccw ? w - 1 - x : x;
      out[ny * h + nx] = px[y * w + x];
    }
  }
  return { w: h, h: w, px: out };
}

/** Inverse of rotate(): portrait framebuffer image → landscape (for previews). */
export function unrotate(img, dir = ROTATE) {
  const { w, h, px } = img;
  const out = new Uint8Array(w * h);
  const ccw = dir === "ccw";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lx = ccw ? h - 1 - y : y;
      const ly = ccw ? x : w - 1 - x;
      out[ly * h + lx] = px[y * w + x];
    }
  }
  return { w: h, h: w, px: out };
}

/**
 * Where a landscape rect (pixels on a `canvas` of w × h) lands in the
 * portrait framebuffer after rotation.
 */
export function rotatedOrigin(r, dir = ROTATE, canvas = { w: W, h: H }) {
  return dir === "ccw" ? { x: r.y, y: canvas.w - r.x - r.w } : { x: canvas.h - r.y - r.h, y: r.x };
}

/** Copy `src` into `dst` at `at` (both gray images of the same orientation). */
export function paste(dst, src, at) {
  for (let y = 0; y < src.h; y++) {
    dst.px.set(src.px.subarray(y * src.w, (y + 1) * src.w), (at.y + y) * dst.w + at.x);
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** 8-bit grayscale PNG, no alpha — what eips expects. */
export function encodePng({ w, h, px }) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    Buffer.from(px.buffer, px.byteOffset + y * w, w).copy(raw, y * (w + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
