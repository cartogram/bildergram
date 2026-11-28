// ============================================================
// Module: Datum (Phase 14)
// The date tile: the weekday, the day of the month large, the month,
// and the battery at the bottom. Drawn on a dark tile, in the same
// cell on every screen: during a check-in the Kindle pastes
// "Aktualisiere …" over the battery line (updatingRect).
//
// Cadence: daily.
// ============================================================

import { deDateLong, deNumber, exactWidth, firstBaseline, pill, PILL, STAT, text, TILE_INK_DARK, TILE_TYPE, width } from "../design.mjs";
import { dayOfYear, isoWeek, lifeDay, lifeWeek } from "./zeit.mjs";

export const id = "datum";
export const cadence = "daily";
export const sizes = ["small"];

/** The battery line, where "Aktualisiere …" goes. */
export const updatingRect = (box) => ({ x: 0, y: box.h - PILL.h - 2, w: box.w, h: PILL.h + 4 });

/** `date` is null in the prebuilt fallback (no connection yet); `updating` replaces the battery. */
export function render(box, { date, battery, updating = false }) {
  const P = TILE_INK_DARK;
  const ink = (k) => ({ ink: P[k] });
  // The battery in a pill, inverted on the dark tile, its bottom on the content's bottom edge;
  // "Aktualisiere …" takes its place during a check-in.
  const bottom = updating ? "Aktualisiere …" : battery != null ? `Akku ${battery} %` : "";
  let svg = bottom ? pill(0, box.h - (PILL.h - PILL.above), bottom, { fill: P.ink, ink: P.paper }).svg : "";
  const first = firstBaseline(TILE_TYPE.label.size);
  if (!date) {
    return svg + text(0, first, "Keine Verbindung", TILE_TYPE.label, ink("ink")) +
      text(0, first + 38, "Power-Taste drücken", TILE_TYPE.small, ink("muted"));
  }
  // "Dienstag, 24. November" → the weekday, the day large, the month.
  const [, weekday, day, month] = deDateLong(date).match(/^(\S+), (\d+)\. (.+)$/);
  return (
    svg +
    // The labels sit just right of the day (88 bold, drawn from x −4).
    // The rows span the day exactly: T's capitals level with the top of the day's digits, W on its baseline (112).
    (box.born ? timeRows(box, date, box.born, {
      labelX: Math.ceil(exactWidth(day, { size: 88, weight: "bold" })) - 4 + 14,
      ys: [112 - Math.round(88 * 0.716) + Math.round(STAT.value.size * 0.716), 112],
    }) : "") +
    text(0, first, weekday, TILE_TYPE.label, ink("muted")) +
    // The day at 88, not the display 104: at 104 a month with a descender would touch the pill.
    text(-4, 112, day, { size: 88, weight: "bold" }, ink("ink")) +
    text(0, 150, month, TILE_TYPE.heading, ink("ink"))
  );
}

/**
 * Where we are in time, to the right of the day (Phase 17; the Zeit card
 * folded into the date, for a tile with a birthday, `born`): two rows set
 * like the weather's next days — T (Tag) then W (Woche), each label just
 * right of the day — kept low in contrast, so the date stays the brightest thing on the tile: the labels faint, then
 * the year's count (faint, the "low") and the life's count (muted, the
 * "high"), right-aligned in two columns at the tile's right edge.
 * `ys` are the rows' baselines; `style` their type; `labelX` where the T and W go.
 */
export function timeRows(box, date, born, { ys = [75, 112], style = STAT.value, labelX = null } = {}) {
  const P = TILE_INK_DARK;
  const rows = [
    ["T", String(dayOfYear(date).day), deNumber(lifeDay(date, born))],
    ["W", String(isoWeek(date).week), deNumber(lifeWeek(date, born))],
  ];
  const highW = Math.ceil(width("00.000", style)) + 18;
  return rows.map(([label, year, life], i) =>
    (labelX === null ? "" : text(labelX, ys[i], label, { ...TILE_TYPE.label, ink: P.faint })) +
    text(box.w - highW, ys[i], year, { ...style, ink: P.faint }, { anchor: "end" }) +
    text(box.w, ys[i], life, { ...style, ink: P.muted }, { anchor: "end" })).join("");
}
