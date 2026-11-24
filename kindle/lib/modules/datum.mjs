// ============================================================
// Module: Datum (Phase 14)
// The date tile: the weekday, the day of the month large, the month,
// and the battery at the bottom. Drawn on a dark tile, in the same
// cell on every screen: during a check-in the Kindle pastes
// "Aktualisiere …" over the battery line (updatingRect).
//
// Cadence: daily.
// ============================================================

import { deDateLong, INK, INK_DARK, pill, PILL, text, TILE_TYPE, TITLE_SPACE, TYPE } from "../design.mjs";

export const id = "datum";
export const cadence = "daily";

/** The battery line in module coordinates, where "Aktualisiere …" goes. */
export const updatingRect = (box) => ({ x: 0, y: box.h - PILL.h - 2, w: box.w, h: PILL.h + 4 });

/** `date` is null in the prebuilt fallback (no connection yet); `updating` replaces the battery. */
export function render(box, { date, battery, updating = false }) {
  const ink = (i) => ({ ink: INK_DARK[i] });
  // The battery in a pill, inverted on the dark tile; "Aktualisiere …" takes its place during a check-in.
  const bottom = updating ? "Aktualisiere …" : battery != null ? `Akku ${battery} %` : "";
  // The pill's bottom on the content box's bottom edge.
  let svg = bottom ? pill(0, box.h - (PILL.h - PILL.above), bottom, { fill: INK.paper, ink: INK.primary }).svg : "";
  const top = TITLE_SPACE;
  if (!date) {
    return svg + text(0, top + 40, "Keine", TYPE.strong, ink("primary")) + text(0, top + 90, "Verbindung", TYPE.strong, ink("primary")) +
      text(0, top + 150, "Power-Taste drücken", { ...TYPE.caption, size: 22 }, ink("secondary"));
  }
  // "Dienstag, 24. November" → the weekday, the day large, the month.
  const [, weekday, day, month] = deDateLong(date).match(/^(\S+), (\d+)\. (.+)$/);
  return (
    svg +
    text(0, top + 28, weekday, TILE_TYPE.label, ink("secondary")) +
    text(-4, top + 112, day, { size: 88, weight: "bold" }, ink("primary")) +
    text(0, top + 150, month, TILE_TYPE.heading, ink("primary"))
  );
}
