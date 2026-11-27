// ============================================================
// Module: Foto (Phase 17, a placeholder)
// A photo filling its tile edge to edge, with the tile's rounded corners
// (a "bleed" tile: the picture reaches into the padding). Until photos can
// be uploaded (the Foto backlog item: admin upload → R2 → the renderer),
// `data.href` may point at an image (a data: URI or file path), and
// without one the tile shows a placeholder — a landscape glyph and "Foto".
//
// Cadence: daily.
// ============================================================

import { GRID, text, TILE_INK, TILE_TYPE } from "../design.mjs";

export const id = "foto";
export const cadence = "daily";
export const sizes = ["small", "medium", "wide", "large"];

let clipId = 0;

/** `data`: { href } or nothing. The picture covers the whole tile (box.bleed into the padding), cropped to fill. */
export function render(box, data) {
  const b = box.bleed ?? 0;
  const x = -b, y = -b, w = box.w + 2 * b, h = box.h + 2 * b;
  // The tile's corner radius, in drawing units (the tile draws at GRID.scale).
  const rx = GRID.radius / GRID.scale;
  const id = `foto${++clipId}`;
  const clip = `<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/></clipPath></defs>`;
  if (data?.href) {
    return clip + `<image href="${data.href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`;
  }
  // The placeholder: a light gray field, a simple landscape (sun, two hills) and the word.
  const cx = box.w / 2, cy = box.h / 2 - 16;
  const s = 56; // the glyph's half-width
  return clip + `<g clip-path="url(#${id})"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#dddddd"/></g>` +
    `<g fill="none" stroke="${TILE_INK.muted}" stroke-width="4" stroke-linejoin="round">` +
    `<rect x="${cx - s}" y="${cy - s * 0.7}" width="${2 * s}" height="${1.4 * s}" rx="10"/>` +
    `<circle cx="${cx + s * 0.4}" cy="${cy - s * 0.25}" r="${s * 0.14}"/>` +
    `<path d="M ${cx - s} ${cy + s * 0.45} L ${cx - s * 0.35} ${cy - s * 0.1} L ${cx + s * 0.1} ${cy + s * 0.3} L ${cx + s * 0.4} ${cy + s * 0.08} L ${cx + s} ${cy + s * 0.5}"/>` +
    `</g>` + text(cx, cy + s * 0.7 + 40, "Foto", { ...TILE_TYPE.label, ink: TILE_INK.muted }, { anchor: "middle" });
}
