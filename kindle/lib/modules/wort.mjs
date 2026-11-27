// ============================================================
// Module: Wort des Tages (Phase 17)
// One German word a day (B2): the word large, its article (nouns) in an
// outlined pill below it, and the English below that in the small size, all
// centred. A small card; the word stays on one line, shrinking for long
// compounds.
// Entries live in kindle/data/woerter-des-tages.json
// ({ artikel?, wort, en }, 365 B2 words) and rotate in order, like the
// Ausdruck; a tile's `offset` reads further along the list, so two
// screens can show different words on the same day.
//
// Cadence: daily (deterministic, no network needed).
// ============================================================

import { readFileSync } from "node:fs";
import { fitSize, pill, PILL, text, TILE_INK, TILE_TYPE } from "../design.mjs";
import { wrap } from "../eink.mjs";
import { entryFor as rotate } from "./ausdruck.mjs";

export const id = "wort";
export const cadence = "daily";
export const sizes = ["small"];

/** The smallest the German may shrink to, so a long compound stays on one line. */
export const MIN_SIZE = 24;

export function loadEntries() {
  return JSON.parse(readFileSync(new URL("../../data/woerter-des-tages.json", import.meta.url), "utf8"));
}

/**
 * The entry for a Berlin date (YYYY-MM-DD), rotating like the Ausdruck des
 * Tages; `offset` days further along the list for a second tile (Matt's
 * reads 183 ahead of Fiona's, so with 365 words they never match).
 */
export function entryFor(date, entries = loadEntries(), offset = 0) {
  return rotate(date, entries, offset);
}

/** The German line's size: the heading size, smaller for a word too wide for the card (down to MIN_SIZE). */
export const germanSize = (box, entry) => fitSize(entry.wort, TILE_TYPE.heading, box.w, MIN_SIZE);

/** The gaps between the word, the article's pill and the English. */
const GAP = 18;

/**
 * { artikel?, wort, en } → centred: the word (heading, bold), the article
 * in an outlined pill (nouns only), and the English (small, muted).
 */
export function render(box, entry) {
  const size = germanSize(box, entry);
  const en = { ...TILE_TYPE.small, ink: TILE_INK.muted };
  const enLead = Math.round(en.size * 1.3);
  const enLines = wrap(entry.en, en.size, box.w, 2);
  const cap = Math.round(size * 0.716);
  const enCap = Math.round(en.size * 0.716);
  // The block's height: the word's capitals, the pill (nouns), the English lines.
  const pillH = entry.artikel ? GAP + PILL.h : 0;
  const blockH = cap + pillH + GAP + enCap + (enLines.length - 1) * enLead;
  const top = Math.round((box.h - blockH) / 2);
  const cx = box.w / 2;
  let y = top + cap;
  let svg = text(cx, y, entry.wort, { size, weight: "bold" }, { anchor: "middle" });
  if (entry.artikel) {
    const w = pill(0, 0, entry.artikel, { outline: true }).w;
    // The pill's top GAP below the word's baseline; its text's baseline PILL.above below that.
    svg += pill(cx - w / 2, y + GAP + PILL.above, entry.artikel, { outline: true }).svg;
    y += GAP + PILL.h;
  }
  y += GAP + enCap;
  enLines.forEach((l, i) => {
    svg += text(cx, y + i * enLead, l, en, { anchor: "middle" });
  });
  return svg;
}
