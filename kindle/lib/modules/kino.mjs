// ============================================================
// Module: Im Kino (Phase 8; a tile since Phase 14)
// The evening's screenings at the chosen Yorck cinemas in one list by
// time: the time (bold), the title, the cinema's letter in a circle; as
// many as fit, then "+ n weitere". From 22:00 Berlin time the tile shows
// tomorrow's listing ("morgen ab 18:00" — render.mjs kinoDay).
//
// Cadence: daily (rendered at check-in for the slot's date).
// Data: kindle/lib/kino.mjs → fetchProgramme(slugs).
// ============================================================

import { CIRCLE_LABEL, circleLabel, firstBaseline, text, TILE_INK, TILE_TYPE, width } from "../design.mjs";
import { wrap } from "../eink.mjs";

export const id = "kino";
export const cadence = "daily";

const ROW = TILE_TYPE.body;
const ROW_LEAD = 46;
/** The first row's baseline, below the title line. */
const ROWS_TOP = 92;
const SMALL = { ...TILE_TYPE.small, ink: TILE_INK.muted };

/** The listing for `date` (screenings at or after `from`); `day` names it ("heute", "morgen"). */
export function render(box, programme, { date, day = "heute", from = "18:00" } = {}) {
  const rows = programme.cinemas
    .flatMap((c) => c.sessions.filter((s) => s.date === date && s.time >= from).map((s) => ({ ...s, cinema: c.name })))
    .sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
  const y1 = firstBaseline(TILE_TYPE.label.size);
  let svg = text(0, y1, "Im Kino", TILE_TYPE.label) + text(box.w, y1, `${day} ab ${from}`, SMALL, { anchor: "end" });
  if (!rows.length) return svg + text(0, ROWS_TOP, `${day === "morgen" ? "Morgen" : "Heute"} keine Vorstellungen`, { ...ROW, ink: TILE_INK.muted });
  const timeW = Math.ceil(width("00:00", { ...ROW, weight: "bold" })) + 18;
  const titleW = box.w - timeW - CIRCLE_LABEL.d - 20;
  const letters = cinemaLetters(programme.cinemas.map((c) => c.name));
  // Rows from ROWS_TOP down to the bottom edge; when some are left out,
  // the last row's place goes to "+ n weitere" (on the bottom line).
  let fit = Math.floor((box.h - ROWS_TOP) / ROW_LEAD) + 1;
  if (fit < rows.length) fit = Math.floor((box.h - 40 - ROWS_TOP) / ROW_LEAD) + 1;
  rows.slice(0, fit).forEach((r, i) => {
    const y = ROWS_TOP + i * ROW_LEAD;
    svg += text(0, y, r.time, { ...ROW, weight: "bold" });
    svg += text(timeW, y, wrap(r.title, ROW.size, titleW, 1)[0], ROW);
    // The cinema's letter in a circle, centred on the row's lowercase letters.
    svg += circleLabel(box.w - CIRCLE_LABEL.d / 2, y - Math.round(ROW.size * 0.36), letters.get(r.cinema));
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
