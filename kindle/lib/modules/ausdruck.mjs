// ============================================================
// Module: Ausdruck des Tages (Phase 8)
// One German expression a day (B2): the expression, its English
// meaning, and an example sentence. Entries live in
// kindle/data/ausdruecke.json and rotate in order, one per day.
//
// Cadence: daily (deterministic, no network needed).
// Variants: "wide" (a band across the screen), "full" (whole screen).
// ============================================================

import { readFileSync } from "node:fs";
import { INK, sectionTitle, text, TYPE } from "../design.mjs";
import { wrap } from "../eink.mjs";

export const id = "ausdruck";
export const cadence = "daily";

export function loadEntries() {
  return JSON.parse(readFileSync(new URL("../../data/ausdruecke.json", import.meta.url), "utf8"));
}

/** The entry for a Berlin date (YYYY-MM-DD): days since 2026-01-01, modulo the list. */
export function entryFor(date, entries = loadEntries()) {
  const [y, m, d] = date.split("-").map(Number);
  const days = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86_400_000);
  return entries[((days % entries.length) + entries.length) % entries.length];
}

const quoted = (s) => `„${s}“`;

/** Lines of `str` at `size`, stacked from baseline y; returns { svg, y } with y after the last line. */
function block(str, x, y, size, maxW, maxLines, opts = {}) {
  const style = { ...(opts.style ?? TYPE.body), size };
  const lines = wrap(str, size * (style.weight === "bold" ? 1.07 : 1), maxW, maxLines);
  const lead = Math.round(size * 1.18);
  let svg = "";
  lines.forEach((l, i) => {
    svg += text(x, y + i * lead, l, style);
  });
  return { svg, y: y + (lines.length - 1) * lead };
}

/** The text stack at scale `k` (1 = design size); y values relative to the first baseline. */
function stack(box, entry, full, k, quote = true) {
  const S = full
    ? { head: TYPE.label.size, mean: TYPE.caption.size, ex: TYPE.body.size, headLines: 3, gapMean: 52, gapEx: 70 }
    : { head: TYPE.label.size, mean: TYPE.caption.size, ex: TYPE.body.size, headLines: 2, gapMean: 52, gapEx: 70 };
  const r = (n) => Math.round(n * k);
  const head = block(quote ? quoted(entry.ausdruck) : entry.ausdruck, 0, 0, r(S.head), box.w, S.headLines, { style: TYPE.strong });
  const mean = block(entry.bedeutung, 0, head.y + r(S.gapMean), r(S.mean), box.w, 2, { style: TYPE.caption });
  const exY = mean.y + r(S.gapEx);
  // Up to four example lines where the column is narrow (half the screen).
  const ex = block(entry.beispiel, 0, exY, r(S.ex), box.w, box.w < 900 ? 4 : full ? 3 : 2);
  let svg = head.svg + mean.svg + ex.svg;

  return { svg, ascent: r(S.head * 0.8), bottom: ex.y + r(S.ex * 0.3) };
}

/**
 * `title` and `quote` let other "… des Tages" modules (praeposition)
 * reuse this layout: { ausdruck, bedeutung, beispiel } entries.
 */
export function render(box, entry, { title = "Ausdruck des Tages", quote = true } = {}) {
  const full = box.variant === "full";
  const top = 72; // below the module label

  // Full screen: centre the stack under the label. A band: start just below
  // the label, shrinking the text until long entries fit the box.
  let s;
  for (const k of full ? [1] : [1, 0.9, 0.82, 0.75]) {
    s = stack(box, entry, full, k, quote);
    if (full || 112 + s.bottom <= box.h) break;
  }
  const firstBaseline = full
    ? top + Math.max(0, Math.round((box.h - top - s.bottom - s.ascent) / 2)) + s.ascent
    : 112;
  return sectionTitle(title) + `<g transform="translate(0 ${firstBaseline})">${s.svg}</g>`;
}
