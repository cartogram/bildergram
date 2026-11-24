// ============================================================
// Module: Ausdruck des Tages (Phase 8)
// One German expression a day (B2): the expression, its English
// meaning, and an example sentence. Entries live in
// kindle/data/ausdruecke.json and rotate in order, one per day.
//
// Cadence: daily (deterministic, no network needed).
// Variants: "wide" (a band across the screen), "full" (whole screen),
// "card" (a tile: the expression and meaning centred).
// ============================================================

import { readFileSync } from "node:fs";
import { firstBaseline, INK, sectionTitle, text, TILE_INK, TILE_TYPE, TITLE_SPACE, TYPE, width } from "../design.mjs";
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
    svg += text(opts.center ? x + maxW / 2 : x, y + i * lead, l, style, opts.center ? { anchor: "middle" } : {});
  });
  return { svg, y: y + (lines.length - 1) * lead };
}

/** The text stack at scale `k` (1 = design size); y values relative to the first baseline. */
function stack(box, entry, full, k, quote = true) {
  const S = full
    ? { head: TYPE.label.size, mean: TYPE.caption.size, ex: TYPE.body.size, headLines: 3, gapMean: 52, gapEx: 70 }
    : { head: TYPE.label.size, mean: TYPE.caption.size, ex: TYPE.body.size, headLines: 2, gapMean: 52, gapEx: 70 };
  const r = (n) => Math.round(n * k);
  // A card (Phase 14): everything centred; the English meaning is the
  // card's title, then the expression (no quotes) and the example under it.
  const card = box.variant === "card";
  if (card) {
    const title = block(entry.bedeutung, 0, 0, r(TILE_TYPE.label.size), box.w, 2, { style: TILE_TYPE.label, center: true });
    // No quotes on a card; the example follows at its own line spacing.
    const head = block(entry.ausdruck, 0, title.y + r(64), r(S.head), box.w, S.headLines, { style: TYPE.strong, center: true });
    const ex = block(entry.beispiel, 0, head.y + r(Math.round(S.ex * 1.18)), r(S.ex), box.w, 4, { center: true });
    return { svg: title.svg + head.svg + ex.svg, ascent: r(TILE_TYPE.label.size * 0.8), bottom: ex.y + r(S.ex * 0.3), headSize: r(TILE_TYPE.label.size) };
  }
  const head = block(quote ? quoted(entry.ausdruck) : entry.ausdruck, 0, 0, r(S.head), box.w, S.headLines, { style: TYPE.strong, center: card });
  const mean = block(entry.bedeutung, 0, head.y + r(S.gapMean), r(S.mean), box.w, 2, { style: TYPE.caption, center: card });
  const exY = mean.y + r(card ? 104 : S.gapEx);
  // Up to four example lines where the column is narrow (half the screen).
  const ex = block(entry.beispiel, 0, exY, r(S.ex), box.w, box.w < 900 ? 4 : full ? 3 : 2, { center: card });
  let svg = head.svg + mean.svg + ex.svg;

  return { svg, ascent: r(S.head * 0.8), bottom: ex.y + r(S.ex * 0.3), headSize: r(S.head) };
}

/**
 * `title` and `quote` let other "… des Tages" modules (praeposition)
 * reuse this layout: { ausdruck, bedeutung, beispiel } entries.
 */
export function render(box, entry, { title = "Ausdruck des Tages", quote = true } = {}) {
  const full = box.variant === "full";
  const card = box.variant === "card";
  const top = 72; // below the module label

  // A card with words (Phase 14, mock data so far): they sit at the bottom,
  // the stack fits above them.
  const words = card && entry.woerter?.length ? woerter(box, entry.woerter) : null;
  const room = box.h - (words ? words.h + 28 : 0);

  // Full screen: centre the stack under the label. A band: start just below
  // the label, shrinking the text until long entries fit the box.
  // A card's first line starts at FIRST_CAP like every tile's.
  const startAt = (st) => (card ? TITLE_SPACE + firstBaseline(st.headSize) : 112);
  let s;
  for (const k of full ? [1] : [1, 0.9, 0.82, 0.75]) {
    s = stack(box, entry, full, k, quote);
    if (full || startAt(s) + s.bottom <= room) break;
  }
  const first = card ? startAt(s) : full
    ? top + Math.max(0, Math.round((box.h - top - s.bottom - s.ascent) / 2)) + s.ascent
    : 112;
  return sectionTitle(title) + `<g transform="translate(0 ${first})">${s.svg}</g>` + (words?.svg ?? "");
}

/**
 * Words from the example, at the bottom of a card as one left-aligned
 * stream: each word a group (a noun: article bold, the noun, its plural
 * ending faint; a verb: bold, then its past forms), groups set apart by
 * GROUP_GAP and never broken across lines; the last line on the bottom edge.
 * `list`: [{ artikel, wort, plural } | { verb, formen }]. Returns { svg, h }.
 */
const GROUP_GAP = 36;
function woerter(box, list) {
  const size = 26;
  const lead = 38;
  const bold = { size, weight: "bold" };
  const plain = { size };
  // Each group as runs of [text, style]; runs within a group are a space apart.
  const groups = list.map((w) =>
    w.verb
      ? [[w.verb, bold], [w.formen, { size, ink: INK.secondary }]]
      : [[w.artikel, bold], [w.wort, plain], [w.plural, { size, ink: INK.tertiary }]],
  );
  const space = Math.ceil(width(" ", plain));
  const groupW = (g) => g.reduce((sum, [t, st]) => sum + Math.ceil(width(t, st)), 0) + (g.length - 1) * space;
  // Flow the groups into lines.
  const lines = [[]];
  let x = 0;
  for (const g of groups) {
    const w = groupW(g);
    if (x > 0 && x + GROUP_GAP + w > box.w) {
      lines.push([]);
      x = 0;
    }
    if (x > 0) x += GROUP_GAP;
    lines[lines.length - 1].push({ g, x });
    x += w;
  }
  const h = lines.length * lead;
  const y0 = box.h - (lines.length - 1) * lead; // the last line on the bottom edge
  let svg = "";
  lines.forEach((line, i) => {
    for (const { g, x: gx } of line) {
      let cx = gx;
      for (const [t, st] of g) {
        svg += text(cx, y0 + i * lead, t, st);
        cx += Math.ceil(width(t, st)) + space;
      }
    }
  });
  return { svg, h };
}
