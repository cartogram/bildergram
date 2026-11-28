// ============================================================
// Module: Im Kino (Phase 8; a tile since Phase 14)
// The evening's screenings at the chosen Yorck cinemas in one list by
// time: the time (bold), the title, the cinema's letter in a circle; as
// many as fit, then "+ n weitere". From 22:00 Berlin time the tile shows
// tomorrow's listing ("morgen ab 18:00" — render.mjs kinoDay).
// Medium (Phase 16) and tall (a full column, Phase 17) say just "heute"
// or "morgen" in the header. Medium has one line per screening: the time
// (label), the title at 28 regular in faint ink, cut just short of the
// cinema's letter. Tall has two: the time with its language version
// and, at the right, the language versions (OmU, OmeU, OV …) in outlined pills and the letter, then the title on its own line.
//
// Cadence: daily (rendered at check-in for the slot's date).
// Data: kindle/lib/kino.mjs → fetchProgramme(slugs).
// ============================================================

import { CIRCLE_LABEL, circleLabel, clipText, exactWidth, firstBaseline, pill, STAT, text, TILE_INK, TILE_TYPE, width } from "../design.mjs";
import { wrap } from "../eink.mjs";

export const id = "kino";
export const cadence = "daily";
export const sizes = ["medium", "tall", "large"];

const ROW = TILE_TYPE.body;
/** The first row's baseline, below the title line. */
const ROWS_TOP = 92;
const SMALL = { ...TILE_TYPE.small, ink: TILE_INK.muted };

/** Room kept at the bottom for "+ n weitere". */
const MORE = 40;

/** The listing for `date` (screenings at or after `from`); `day` names it ("heute", "morgen"). */
export function render(box, programme, { date, day = "heute", from = "18:00" } = {}) {
  const rows = programme.cinemas
    .flatMap((c) => c.sessions.filter((s) => s.date === date && s.time >= from).map((s) => ({ ...s, cinema: c.name })))
    .sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
  const medium = box.size !== "large";
  const y1 = firstBaseline(TILE_TYPE.label.size);
  let svg = text(0, y1, "Im Kino", TILE_TYPE.label) + text(box.w, y1, medium ? day : `${day} ab ${from}`, SMALL, { anchor: "end" });
  if (!rows.length) {
    const none = { ...ROW, ink: TILE_INK.muted };
    const lines = wrap(`${day === "morgen" ? "Morgen" : "Heute"} keine Vorstellungen`, none.size, box.w, 2);
    return svg + lines.map((l, i) => text(0, ROWS_TOP + i * ROW.lead, l, none)).join("");
  }
  const letters = cinemaLetters(programme.cinemas.map((c) => c.name));
  return svg + (box.size === "tall" ? rowsTall(box, rows, letters) : medium ? rowsMedium(box, rows, letters) : list(box, rows, letters));
}

/** Large: one row per screening — time, title, the cinema's letter — in the body size, ROW.lead apart. */
function list(box, rows, letters) {
  let svg = "";
  const timeW = Math.ceil(width("00:00", { ...ROW, weight: "bold" })) + 18;
  const titleW = box.w - timeW - CIRCLE_LABEL.d - 20;
  // Rows from ROWS_TOP down to the bottom edge; when some are left out,
  // the last row's place goes to "+ n weitere" (on the bottom line).
  let fit = Math.floor((box.h - ROWS_TOP) / ROW.lead) + 1;
  if (fit < rows.length) fit = Math.floor((box.h - MORE - ROWS_TOP) / ROW.lead) + 1;
  rows.slice(0, fit).forEach((r, i) => {
    const y = ROWS_TOP + i * ROW.lead;
    svg += text(0, y, r.time, { ...ROW, weight: "bold" });
    svg += text(timeW, y, wrap(r.title, ROW.size, titleW, 1)[0], ROW);
    // The cinema's letter in a circle, centred on the row's lowercase letters.
    svg += circleLabel(box.w - CIRCLE_LABEL.d / 2, y - Math.round(ROW.size * 0.36), letters.get(r.cinema));
  });
  if (fit < rows.length) svg += text(0, box.h, `+ ${rows.length - fit} weitere`, SMALL);
  return svg;
}

/**
 * Medium: the title starts TIME_GAP after the time; its area reaches
 * TITLE_EXTRA past the cinema letter's left edge — the "…" sits on the
 * baseline, below the circle's widest point, so it can tuck under its curve.
 */
const TIME_GAP = 8;
const TITLE_EXTRA = 6;

/**
 * Medium: one line per screening, STAT.lead apart like the stat rows —
 * the time in the label style, the title at the same 28 in regular weight
 * and faint ink, cut with the design system's ELLIPSIS (clipText) so it
 * runs almost into the cinema's letter.
 */
function rowsMedium(box, rows, letters) {
  const time = TILE_TYPE.label;
  const title = { size: STAT.value.size, ink: TILE_INK.faint };
  const timeW = Math.ceil(exactWidth("00:00", time)) + TIME_GAP;
  const titleW = box.w - timeW - CIRCLE_LABEL.d + TITLE_EXTRA;
  let fit = Math.floor((box.h - ROWS_TOP) / STAT.lead) + 1;
  if (fit < rows.length) fit = Math.floor((box.h - MORE - ROWS_TOP) / STAT.lead) + 1;
  let svg = "";
  rows.slice(0, fit).forEach((r, i) => {
    const y = ROWS_TOP + i * STAT.lead;
    svg += text(0, y, r.time, time);
    svg += clipText(timeW, y, r.title, title, titleW);
    svg += circleLabel(box.w - CIRCLE_LABEL.d / 2, y - Math.round(time.size * 0.36), letters.get(r.cinema));
  });
  if (fit < rows.length) svg += text(0, box.h, `+ ${rows.length - fit} weitere`, SMALL);
  return svg;
}

/**
 * The language versions shown beside the time (yorck.de's formats also
 * carry series names, such as "Festival" or "Creepy C", which are left out).
 */
const VERSIONS = ["OV", "OmU", "OmeU", "OmdU", "DF"];
const versions = (r) => (r.formats ?? []).filter((f) => VERSIONS.includes(f));

/** Tall: a screening's title sits TALL_DROP below its time; screenings are TALL_LEAD apart. */
const TALL_DROP = 34;
const TALL_LEAD = 84;

/**
 * Tall (a full column, Phase 17): two lines per screening — the time in
 * the label style, then at the right its language versions in outlined
 * pills and the cinema's letter (all on the time's baseline), then the title on its own line
 * (28 regular, muted, cut with clipText at the column's width).
 */
function rowsTall(box, rows, letters) {
  const time = TILE_TYPE.label;
  const title = { size: STAT.value.size, ink: TILE_INK.muted };
  const timeW = Math.ceil(exactWidth("00:00", time)) + 12;
  // A screening's last line is its title: it fits while that's on or above the bottom edge (or "+ n weitere").
  const fitting = (bottom) => Math.floor((bottom - TALL_DROP - ROWS_TOP) / TALL_LEAD) + 1;
  let fit = fitting(box.h);
  if (fit < rows.length) fit = fitting(box.h - MORE);
  let svg = "";
  // The right of each time line: its language versions in outlined pills, then the cinema's letter
  // at the right edge (one column, so the letters line up row to row); the pills end just before it.
  const letterX = box.w - CIRCLE_LABEL.d / 2;
  rows.slice(0, fit).forEach((r, i) => {
    const y = ROWS_TOP + i * TALL_LEAD;
    // The time, the pills and the letter share one baseline, y.
    svg += text(0, y, r.time, time);
    svg += circleLabel(letterX, y - Math.round(CIRCLE_LABEL.size * 0.36), letters.get(r.cinema));
    let px = box.w - CIRCLE_LABEL.d - 6;
    for (const v of versions(r).reverse()) {
      const p = pill(px, y, v, { outline: true, right: true });
      svg += p.svg;
      px = p.x - 6;
    }
    svg += clipText(0, y + TALL_DROP, r.title, title, box.w);
  });
  if (fit < rows.length) svg += text(0, box.h, `+ ${rows.length - fit} weitere`, SMALL);
  return svg;
}

/** "Neues Off" → "NO", "Rollberg" → "R". */
const initials = (name) => name.split(/[\s-]+/).filter(Boolean).map((w) => w[0].toUpperCase()).join("").slice(0, 2);

/** Each cinema's label: its first letter ("Neues Off" → "N"), or its two initials when the first letter is shared. */
function cinemaLetters(names) {
  const first = (n) => n.trim()[0].toUpperCase();
  return new Map(names.map((n) => [n, names.filter((m) => first(m) === first(n)).length > 1 ? initials(n) : first(n)]));
}
