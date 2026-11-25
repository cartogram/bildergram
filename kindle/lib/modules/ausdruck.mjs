// ============================================================
// Module: Ausdruck des Tages (Phase 8; a card since Phase 14)
// One German expression a day (B2) as a card, everything centred: the
// English meaning as the title, the expression, the example sentence,
// and at the bottom the example's Wörter (nouns with article and plural,
// verbs with their past forms) as a left-aligned stream. Entries live in
// kindle/data/ausdruecke.json, their Wörter in kindle/data/woerter.json
// (by index); they rotate in order, one per day.
//
// Cadence: daily (deterministic, no network needed).
// ============================================================

import { readFileSync } from "node:fs";
import { firstBaseline, text, TILE_INK, TILE_TYPE, width } from "../design.mjs";
import { wrap } from "../eink.mjs";

export const id = "ausdruck";
export const cadence = "daily";

const readData = (file) => JSON.parse(readFileSync(new URL(`../../data/${file}`, import.meta.url), "utf8"));

/** The 365 entries, each with its Wörter (kindle/data/woerter.json, by index) when there are any. */
export function loadEntries() {
  let woerter = {};
  try {
    woerter = readData("woerter.json");
  } catch {
    // No Wörter yet: the cards show without them.
  }
  return readData("ausdruecke.json").map((e, i) => (woerter[i] ? { ...e, woerter: woerter[i] } : e));
}

/** The entry for a Berlin date (YYYY-MM-DD): days since 2026-01-01, modulo the list. */
export function entryFor(date, entries = loadEntries()) {
  const [y, m, d] = date.split("-").map(Number);
  const days = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86_400_000);
  return entries[((days % entries.length) + entries.length) % entries.length];
}

/** Centred lines of `str` from baseline y; returns { svg, y } with y the last line's baseline. */
function block(str, y, style, maxW, maxLines) {
  const lines = wrap(str, style.size * (style.weight === "bold" ? 1.07 : 1), maxW, maxLines);
  const lead = Math.round(style.size * 1.18);
  let svg = "";
  lines.forEach((l, i) => {
    svg += text(maxW / 2, y + i * lead, l, style, { anchor: "middle" });
  });
  return { svg, y: y + (lines.length - 1) * lead };
}

/** The card's text at scale `k` (1 = the type scale); baselines from the first line (0). */
function stack(box, entry, k) {
  const at = (style) => ({ ...style, size: Math.round(style.size * k) });
  const title = block(entry.bedeutung, 0, at(TILE_TYPE.label), box.w, 2);
  const head = block(entry.ausdruck, title.y + Math.round(56 * k), at(TILE_TYPE.heading), box.w, 3);
  const body = at(TILE_TYPE.body);
  const ex = block(entry.beispiel, head.y + Math.round(body.size * 1.18), body, box.w, 4);
  return { svg: title.svg + head.svg + ex.svg, bottom: ex.y + Math.round(body.size * 0.3), first: firstBaseline(at(TILE_TYPE.label).size) };
}

/**
 * The card for `entry` ({ ausdruck, bedeutung, beispiel, woerter? }); the
 * text shrinks (down to 80 %) until it fits above the Wörter.
 */
export function render(box, entry) {
  const words = entry.woerter?.length ? woerter(box, entry.woerter) : null;
  const room = box.h - (words ? words.h + 24 : 0);
  let s;
  for (const k of [1, 0.92, 0.86, 0.8]) {
    s = stack(box, entry, k);
    if (s.first + s.bottom <= room) break;
  }
  return `<g transform="translate(0 ${s.first})">${s.svg}</g>` + (words?.svg ?? "");
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
  const size = TILE_TYPE.small.size;
  const lead = 34;
  const bold = { size, weight: "bold" };
  const plain = { size };
  // Each group as runs of [text, style]; runs within a group are a space apart.
  const groups = list.map((w) =>
    w.verb
      ? [[w.verb, bold], [w.formen, { size, ink: TILE_INK.muted }]]
      : [[w.artikel, bold], [w.wort, plain], [w.plural, { size, ink: TILE_INK.faint }]],
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
