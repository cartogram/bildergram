// ============================================================
// Bitmap Canvas (Phase 3)
// 1-bit-oriented canvas: every pixel is ink (0) or blank (1).
// Used by the pure-JS e-ink renderer — no rasteriser required.
// ============================================================

import { GLYPHS, GLYPH_CAP_HEIGHT, type GlyphBitmap } from "./glyphs";

export class Bitmap {
  readonly width: number;
  readonly height: number;
  /** 1 = blank (white), 0 = ink (black). */
  readonly data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height).fill(1);
  }

  /** Set a single pixel (out-of-bounds writes are ignored). */
  setPixel(x: number, y: number, ink: boolean): void {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) {
      this.data[y * this.width + x] = ink ? 0 : 1;
    }
  }

  /** Fill a w×h block of ink (clipped at the canvas edge). */
  fillBlock(x: number, y: number, w: number, h: number): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.setPixel(x + dx, y + dy, true);
      }
    }
  }
}

// ------------------------------------------------------------------
// Text (bitmap font, glyphs in ./glyphs)
// ------------------------------------------------------------------

/** Integer scale factor for a requested text size (the font is a single bitmap size). */
function scaleFor(size: number): number {
  return Math.max(1, Math.round(size / GLYPH_CAP_HEIGHT));
}

/**
 * Glyph for a character. Accented letters missing from the table fall
 * back to their base letter (e.g. "č" → "c"); anything else is undefined.
 */
function glyphFor(ch: string): GlyphBitmap | undefined {
  return GLYPHS[ch] ?? GLYPHS[ch.normalize("NFD")[0]];
}

/** Advance used for characters with no glyph — the width of a space. */
const FALLBACK_ADVANCE = GLYPHS[" "]?.adv ?? 7;

export function textWidth(text: string, size: number): number {
  const s = scaleFor(size);
  let w = 0;
  for (const ch of text) w += (glyphFor(ch)?.adv ?? FALLBACK_ADVANCE) * s;
  return w;
}

/** Draw text with its cap top at `y` (descenders and accents extend beyond the cap height). */
export function drawText(bm: Bitmap, text: string, x: number, y: number, size: number): void {
  const s = scaleFor(size);
  // Snap to whole pixels: centered text (W / 2 - width / 2) can land on a
  // half pixel, and fractional indices into the bitmap are silently dropped.
  let cx = Math.round(x);
  const top = Math.round(y);
  for (const ch of text) {
    const g = glyphFor(ch);
    if (g) {
      const gx = cx + g.x * s;
      const gy = top + g.y * s;
      for (let r = 0; r < g.rows.length; r++) {
        const row = g.rows[r];
        for (let c = 0; c < row.length; c++) {
          if (row[c] === "#") bm.fillBlock(gx + c * s, gy + r * s, s, s);
        }
      }
    }
    cx += (g?.adv ?? FALLBACK_ADVANCE) * s;
  }
}

// ------------------------------------------------------------------
// Shapes
// ------------------------------------------------------------------

/** Stroked line with the given pixel width (circle-capped ends). */
export function drawLine(bm: Bitmap, x0: number, y0: number, x1: number, y1: number, width = 2): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const r = Math.floor(width / 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    bm.fillBlock(Math.round(x0 + (x1 - x0) * t) - r, Math.round(y0 + (y1 - y0) * t) - r, width, width);
  }
}

/** Stroked rectangle (e.g. device frame, widget boxes). */
export function drawRect(bm: Bitmap, x: number, y: number, w: number, h: number, stroke = 3): void {
  for (let i = 0; i < stroke; i++) {
    drawLine(bm, x + i, y + i, x + w - 1 - i, y + i);
    drawLine(bm, x + i, y + h - 1 - i, x + w - 1 - i, y + h - 1 - i);
    drawLine(bm, x + i, y + i, x + i, y + h - 1 - i);
    drawLine(bm, x + w - 1 - i, y + i, x + w - 1 - i, y + h - 1 - i);
  }
}

/** Filled circle stroke (outer ring) — used for weather icons and markers. */
export function drawCircleStroke(bm: Bitmap, cx: number, cy: number, r: number, stroke = 2): void {
  for (let i = 0; i < stroke; i++) {
    for (let a = 0; a < 2 * Math.PI; a += 0.05) {
      bm.setPixel(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), true);
    }
  }
}

/** Filled rectangle (for "banner"-style shapes). */
export function drawFilledRect(bm: Bitmap, x: number, y: number, w: number, h: number): void {
  bm.fillBlock(x, y, w, h);
}

/** Filled triangle (for subtle warning markers). */
export function drawTriangle(
  bm: Bitmap,
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
): void {
  const minX = Math.min(x0, x1, x2);
  const maxX = Math.max(x0, x1, x2);
  const minY = Math.min(y0, y1, y2);
  const maxY = Math.max(y0, y1, y2);
  const inside = (px: number, py: number): boolean => {
    const sign = (px: number, py: number, ax: number, ay: number, bx: number, by: number) =>
      (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d1 = sign(px, py, x0, y0, x1, y1);
    const d2 = sign(px, py, x1, y1, x2, y2);
    const d3 = sign(px, py, x2, y2, x0, y0);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  };
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (inside(x, y)) bm.setPixel(x, y, true);
    }
  }
}
