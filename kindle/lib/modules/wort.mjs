// ============================================================
// Module: Wort des Tages (Phase 17)
// One German word a day (B2), or a short phrase (a tile's `source:
// "phrase"`, from the Ausdruck des Tages list): the German large (a phrase
// wraps to up to 3 lines, shrinking if it must), its article (nouns) in an
// outlined pill below it, and the English below that in the small size,
// all centred. A small card.
// Entries live in kindle/data/woerter-des-tages.json
// ({ artikel?, wort, en }, 365 B2 words) and rotate in order, like the
// Ausdruck; a tile's `offset` reads further along the list, so two
// screens can show different words on the same day.
//
// Cadence: daily (deterministic, no network needed).
// ============================================================

import { readFileSync } from "node:fs";
import { pill, PILL, text, TILE_INK, TILE_TYPE } from "../design.mjs";
import { wrap } from "../eink.mjs";
import { entryFor as rotate, entryFor as ausdruckFor, loadEntries as loadAusdruecke } from "./ausdruck.mjs";

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

/** The gaps between the German, the article's pill and the English. */
const GAP = 18;
const EN = { ...TILE_TYPE.small, ink: TILE_INK.muted };
const EN_LEAD = Math.round(EN.size * 1.3);

/**
 * How the German sets in `box`: the heading size, or smaller (2 px steps,
 * down to MIN_SIZE) until it fits in up to 3 lines without a cut and the
 * whole block fits the card. Returns { size, lines, enLines, blockH, fits }.
 */
export function layout(box, entry) {
  const enLines = wrap(entry.en, EN.size, box.w, 2);
  let out;
  for (let size = TILE_TYPE.heading.size; size >= MIN_SIZE; size -= 2) {
    const lines = wrap(entry.wort, size * 1.07, box.w, 3);
    const lead = Math.round(size * 1.33);
    const cut = lines[lines.length - 1].endsWith("…");
    const blockH = Math.round(size * 0.716) + (lines.length - 1) * lead + (entry.artikel ? GAP + PILL.h : 0) +
      GAP + Math.round(EN.size * 0.716) + (enLines.length - 1) * EN_LEAD;
    out = { size, lead, lines, enLines, blockH, fits: !cut && blockH <= box.h };
    if (out.fits) break;
  }
  return out;
}

/** The German line's size (for the build's report). */
export const germanSize = (box, entry) => layout(box, entry).size;

/**
 * { artikel?, wort, en } → centred: the German (heading, bold; a phrase
 * wraps to up to 3 lines), the article in an outlined pill (nouns only),
 * and the English (small, muted).
 */
export function render(box, entry) {
  const { size, lead, lines, enLines, blockH } = layout(box, entry);
  const cx = box.w / 2;
  let y = Math.round((box.h - blockH) / 2) + Math.round(size * 0.716);
  let svg = "";
  lines.forEach((l, i) => {
    svg += text(cx, y + i * lead, l, { size, weight: "bold" }, { anchor: "middle" });
  });
  y += (lines.length - 1) * lead;
  if (entry.artikel) {
    const w = pill(0, 0, entry.artikel, { outline: true }).w;
    // The pill's top GAP below the last line's baseline; its text's baseline PILL.above below that.
    svg += pill(cx - w / 2, y + GAP + PILL.above, entry.artikel, { outline: true }).svg;
    y += GAP + PILL.h;
  }
  y += GAP + Math.round(EN.size * 0.716);
  enLines.forEach((l, i) => {
    svg += text(cx, y + i * EN_LEAD, l, EN, { anchor: "middle" });
  });
  return svg;
}

/**
 * A short German phrase instead of a word (Phase 17): the Ausdruck des
 * Tages list (365 B2 phrases with their English), in this card's layout.
 * `offset` days further along, as for the words.
 */
export function phraseFor(date, offset = 0) {
  const e = ausdruckFor(date, loadAusdruecke(), offset);
  return { wort: e.ausdruck, en: e.bedeutung };
}
