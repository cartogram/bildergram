// ============================================================
// Module: Im Kino (Phase 8; a tile since Phase 14)
// The evening's screenings at the chosen Yorck cinemas in one list by
// time: the time (bold), the title, the cinema's letter in a circle; as
// many as fit, then "+ n weitere". From 22:00 Berlin time the tile shows
// tomorrow's listing ("morgen ab 18:00" — render.mjs kinoDay).
// Medium (2 × 2, Phase 16): the header says just "heute" or "morgen",
// and each screening is one line: the time (label), the title at 28 in
// regular weight and faint ink, cut just short of the cinema's letter.
//
// Cadence: daily (rendered at check-in for the slot's date).
// Data: kindle/lib/kino.mjs → fetchProgramme(slugs).
// ============================================================

import { CIRCLE_LABEL, circleLabel, clipText, exactWidth, firstBaseline, LIST, STAT, text, TILE_INK, TILE_TYPE, width } from "../design.mjs";
import { wrap } from "../eink.mjs";

export const id = "kino";
export const cadence = "daily";
export const sizes = ["medium", "large"];

const ROW = TILE_TYPE.body;
const ROW_LEAD = 46;
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
  const medium = box.size === "medium";
  const y1 = firstBaseline(TILE_TYPE.label.size);
  let svg = text(0, y1, "Im Kino", TILE_TYPE.label) + text(box.w, y1, medium ? day : `${day} ab ${from}`, SMALL, { anchor: "end" });
  if (!rows.length) {
    const none = { ...ROW, ink: TILE_INK.muted };
    const lines = wrap(`${day === "morgen" ? "Morgen" : "Heute"} keine Vorstellungen`, none.size, box.w, 2);
    return svg + lines.map((l, i) => text(0, ROWS_TOP + i * ROW_LEAD, l, none)).join("");
  }
  const letters = cinemaLetters(programme.cinemas.map((c) => c.name));
  return svg + (medium ? rowsMedium(box, rows, letters) : list(box, rows, letters));
}

/** Large: one row per screening — time, title, the cinema's letter — in the list rows' size (design.mjs LIST, like the weather's next days). */
function list(box, rows, letters) {
  let svg = "";
  const row = { size: LIST.size };
  const timeW = Math.ceil(width("00:00", { ...row, weight: "bold" })) + 18;
  const titleW = box.w - timeW - CIRCLE_LABEL.d - 20;
  // Rows from ROWS_TOP down to the bottom edge; when some are left out,
  // the last row's place goes to "+ n weitere" (on the bottom line).
  let fit = Math.floor((box.h - ROWS_TOP) / LIST.lead) + 1;
  if (fit < rows.length) fit = Math.floor((box.h - MORE - ROWS_TOP) / LIST.lead) + 1;
  rows.slice(0, fit).forEach((r, i) => {
    const y = ROWS_TOP + i * LIST.lead;
    svg += text(0, y, r.time, { ...row, weight: "bold" });
    svg += text(timeW, y, wrap(r.title, row.size, titleW, 1)[0], row);
    // The cinema's letter in a circle, centred on the row's lowercase letters.
    svg += circleLabel(box.w - CIRCLE_LABEL.d / 2, y - Math.round(row.size * 0.36), letters.get(r.cinema));
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

/** "Neues Off" → "NO", "Rollberg" → "R". */
const initials = (name) => name.split(/[\s-]+/).filter(Boolean).map((w) => w[0].toUpperCase()).join("").slice(0, 2);

/** Each cinema's label: its first letter ("Neues Off" → "N"), or its two initials when the first letter is shared. */
function cinemaLetters(names) {
  const first = (n) => n.trim()[0].toUpperCase();
  return new Map(names.map((n) => [n, names.filter((m) => first(m) === first(n)).length > 1 ? initials(n) : first(n)]));
}
