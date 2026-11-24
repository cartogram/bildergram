#!/usr/bin/env node
// tools/gen-glyphs.mjs — generates kindle/lib/glyphs.ts from a font file.
//
// Usage: node tools/gen-glyphs.mjs [fontPath] [fontFamily]
//        (defaults: assets/fonts/Arimo.ttf, Arimo — or `npm run glyphs`)
//
// Each glyph is the cropped ink bitmap of one character, rendered through
// @resvg/resvg-wasm (resvg renders in Node, where WASM is allowed):
// rows of '#' (ink) and '.' (blank), plus its metrics: the ink offset
// from the pen position (x = left bearing, y = offset below the cap top)
// and the advance width. kindle/lib/eink.mjs uses the advance widths to
// measure text for wrapping; the bitmaps are kept for reference.
// It also measures Arimo Bold's advances (to 1/100 px, no bitmaps) for
// exact bold widths, e.g. an underline that ends with the word.

import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const fontPath = process.argv[2] ?? `${REPO}/assets/fonts/Arimo.ttf`;
const family = process.argv[3] ?? "Arimo";
const font = new Uint8Array(readFileSync(fontPath));
const OPTS = { font: { fontBuffers: [font], loadSystemFonts: false, sansSerifFamily: family } };

// Printable ASCII, Latin-1 letters (calendar titles are often German /
// European), and the typographic symbols the dashboard layout uses.
const ASCII = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).join("");
const LATIN1 =
  "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝß" +
  "àáâãäåæçèéêëìíîïñòóôõöøùúûüýÿ";
const SYMBOLS = "°×€–—‘’“”•·…";
const CHARS = ASCII + LATIN1 + SYMBOLS;

/** Reference render size — Arimo's cap height is 18px at 26px. */
const SIZE = 26;
/** Advances are measured at this multiple of SIZE, then scaled back, for sub-pixel precision. */
const MEASURE_SCALE = 4;

function escapeXml(s) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const boldPath = `${REPO}/assets/fonts/Arimo-Bold.ttf`;
const BOLD_OPTS = { font: { fontBuffers: [new Uint8Array(readFileSync(boldPath))], loadSystemFonts: false, sansSerifFamily: family } };

function render(text, size, width, height, originX, baseline, bold = false) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#FFFFFF"/>
    <text x="${originX}" y="${baseline}" font-size="${size}" fill="#000000" font-family="${family}, sans-serif"${bold ? ' font-weight="bold"' : ""}>${escapeXml(text)}</text>
  </svg>`;
  return new Resvg(svg, bold ? BOLD_OPTS : OPTS).render();
}

/** Bounding box of the ink (dark pixels), or null for a blank image. */
function inkBox(img) {
  const pixels = img.pixels; // a getter that copies out of WASM memory — read it once
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (pixels[(y * img.width + x) * 4] < 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

// Glyph cell at the reference size: pen at (ORIGIN_X, BASELINE), with
// room for negative left bearings, accents above caps and descenders.
const CELL = 56;
const ORIGIN_X = 12;
const BASELINE = 40;

function renderGlyph(ch) {
  const img = render(ch, SIZE, CELL, CELL, ORIGIN_X, BASELINE);
  const box = inkBox(img);
  if (!box) return null;
  const pixels = img.pixels;
  const rows = [];
  for (let y = box.minY; y <= box.maxY; y++) {
    let row = "";
    for (let x = box.minX; x <= box.maxX; x++) {
      row += pixels[(y * img.width + x) * 4] < 128 ? "#" : ".";
    }
    rows.push(row);
  }
  return { box, rows };
}

/** Ink width of `text` rendered at SIZE × MEASURE_SCALE. */
function inkWidth(text, bold = false) {
  const size = SIZE * MEASURE_SCALE;
  const box = inkBox(render(text, size, size * 3.5, size * 1.5, size / 4, size, bold));
  return box ? box.maxX - box.minX + 1 : 0;
}

await initWasm(new Uint8Array(readFileSync(`${REPO}/node_modules/@resvg/resvg-wasm/index_bg.wasm`)));

// The cap top of "H" is the reference line: a glyph's `y` is measured from the top of
// the capitals, so a glyph's `y` offset is measured from there.
const cap = renderGlyph("H");
const capTop = cap.box.minY;
const capHeight = cap.box.maxY - cap.box.minY + 1;

// Advance of `ch` = ink width of "H{ch}H" minus that of "HH" (the
// distance between the two H's grows by exactly the advance of `ch`).
const hhWidth = inkWidth("HH");

const glyphs = {};
for (const ch of CHARS) {
  const adv = Math.round((inkWidth(`H${ch}H`) - hhWidth) / MEASURE_SCALE);
  const g = renderGlyph(ch);
  glyphs[ch] = g
    ? {
        w: g.box.maxX - g.box.minX + 1,
        h: g.box.maxY - g.box.minY + 1,
        x: g.box.minX - ORIGIN_X,
        y: g.box.minY - capTop,
        adv,
        rows: g.rows,
      }
    : { w: 0, h: 0, x: 0, y: 0, adv, rows: [] };
}

// Bold advances by the same "H{ch}H" method, kept to 1/100 px.
const hhBold = inkWidth("HH", true);
const boldAdvances = {};
for (const ch of CHARS) boldAdvances[ch] = Math.round(((inkWidth(`H${ch}H`, true) - hhBold) / MEASURE_SCALE) * 100) / 100;

const body = `/**
 * Arimo glyph table: ink bitmaps and metrics. kindle/lib/eink.mjs uses the
 * advance widths to measure text for wrapping.
 * Generated by tools/gen-glyphs.mjs (\`npm run glyphs\`) from
 * assets/fonts/Arimo.ttf — do not edit by hand.
 * Each glyph is the cropped ink bitmap of one character, encoded as
 * rows of '#' (ink) and '.' (blank), plus its placement metrics.
 */
export interface GlyphBitmap {
  /** Ink width in px */
  w: number;
  /** Ink height in px */
  h: number;
  /** Ink offset right of the pen position (left side bearing) */
  x: number;
  /** Ink offset below the cap top (negative = above, e.g. accents) */
  y: number;
  /** Advance width — how far the pen moves after this glyph */
  adv: number;
  rows: string[];
}

/** Cap height (px) of the reference size (26 px). */
export const GLYPH_CAP_HEIGHT = ${capHeight};

export const GLYPHS: Record<string, GlyphBitmap> = {
${Object.entries(glyphs)
    .map(
      ([ch, g]) =>
        `  ${JSON.stringify(ch)}: { w: ${g.w}, h: ${g.h}, x: ${g.x}, y: ${g.y}, adv: ${g.adv}, rows: [${g.rows.map((r) => JSON.stringify(r)).join(", ")}] },`,
    )
    .join("\n")}
};

/** Arimo Bold advance widths (px at the 26 px reference size), for exact bold widths. */
export const BOLD_ADVANCES: Record<string, number> = {
${Object.entries(boldAdvances)
    .map(([ch, a]) => `  ${JSON.stringify(ch)}: ${a},`)
    .join("\n")}
};
`;
writeFileSync(`${REPO}/kindle/lib/glyphs.ts`, body);
console.log(`wrote kindle/lib/glyphs.ts (${Object.keys(glyphs).length} glyphs, ${body.length} bytes)`);
