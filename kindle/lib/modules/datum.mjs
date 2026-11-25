// ============================================================
// Module: Datum (Phase 14)
// The date tile: the weekday, the day of the month large, the month,
// and the battery at the bottom. Drawn on a dark tile, in the same
// cell on every screen: during a check-in the Kindle pastes
// "Aktualisiere …" over the battery line (updatingRect).
//
// Cadence: daily.
// ============================================================

import { deDateLong, firstBaseline, pill, PILL, text, TILE_INK_DARK, TILE_TYPE } from "../design.mjs";

export const id = "datum";
export const cadence = "daily";

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
    text(0, first, weekday, TILE_TYPE.label, ink("muted")) +
    // The day at 88, not the display 104: at 104 a month with a descender would touch the pill.
    text(-4, 112, day, { size: 88, weight: "bold" }, ink("ink")) +
    text(0, 150, month, TILE_TYPE.heading, ink("ink"))
  );
}
