// ============================================================
// Module: Fondfolio (Phase 17)
// Fondfolio Sales this month: one number, usually between 1 and 10, laid
// out like the Feld tile — the number large and left-aligned above, "Fondfolio
// Sales" / "this month" at the bottom left. A small card. The number is
// the orders placed this month, from Fondfolio's dashboard
// (/api/stats/orders-this-month, fetched by the hub); without it, a dash.
//
// Cadence: daily.
// ============================================================

import { text, TILE_TYPE } from "../design.mjs";

export const id = "fondfolio";
export const cadence = "daily";
export const sizes = ["small"];

/** The two lines' spacing, as on the Feld tile (tempelhof.mjs LEAD). */
const LEAD = 32;

/**
 * `data`: { count } (a number, usually 1–10) or nothing. Laid out like
 * the Feld tile: two label lines at the bottom left ("Fondfolio Sales" /
 * "this month"), and above them, where the Feld's gauge is, the number
 * large, left-aligned with the lines.
 */
export function render(box, data) {
  const n = data?.count;
  const line = TILE_TYPE.label;
  const big = TILE_TYPE.display;
  const [l1, l2] = [box.h - LEAD, box.h];
  // The number vertically centred in the space above the lines.
  const cap = Math.round(big.size * 0.716);
  const above = l1 - line.size; // the first line's top, roughly
  const y = Math.round((above - cap) / 2 + cap);
  // Left-aligned with the lines below (the display figures' side bearing pulled in, as on the date tile).
  return text(-Math.round(big.size * 0.04), y, Number.isFinite(n) ? String(n) : "–", big) +
    text(0, l1, "Fondfolio Sales", line) +
    text(0, l2, "this month", line);
}
