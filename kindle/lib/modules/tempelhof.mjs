// ============================================================
// Module: Tempelhofer Feld (Phase 8; one line since Phase 13)
// One line: "Das Feld ist geöffnet, schließt in 3 h 55 min", with the
// day's hours right-aligned on the same line. The countdown sits in its
// own sub-box (countdownBox) so the Kindle can paste a new one every
// minute; its x depends on the state (the sentence before it differs),
// so the build makes a countdown set per state.
//
// Cadence: minute (countdown), changes state twice a day.
// Data: kindle/lib/schedule.mjs → tempelhofState(events, ms).
// ============================================================

import { deCountdown, exactWidth, sectionTitle, text, TYPE, width } from "../design.mjs";

export const id = "tempelhof";
export const cadence = "minute";

/** The longest countdown the schedule produces ("17 h 0 min" in June). */
const WIDEST = "17 h 59 min";
/** The line's baseline in module coordinates (below the title space). */
const BASELINE = 104;
const STYLE = TYPE.body;
const COUNT = TYPE.strong;

const prefix = (open) => (open ? "Das Feld ist geöffnet, schließt in " : "Das Feld ist geschlossen, öffnet in ");

/** The countdown sub-box for a state: right after the sentence, wide enough for any countdown. */
export function countdownBox(box, open = true) {
  return {
    x: Math.round(exactWidth(prefix(open), STYLE)),
    y: BASELINE - Math.round(STYLE.size * 1.0),
    w: Math.ceil(width(WIDEST, COUNT)) + 8,
    h: Math.round(STYLE.size * 1.35),
  };
}

/** The countdown alone, drawn into countdownBox() coordinates. */
export function countdownSvg(box, minutes) {
  return text(0, Math.round(STYLE.size * 1.0), deCountdown(minutes), COUNT);
}

/**
 * The line for this state, plus the countdown unless `withCountdown` is
 * false (the Kindle pastes it).
 */
export function render(box, state, { withCountdown = true } = {}) {
  let svg =
    sectionTitle("Tempelhofer Feld") +
    text(0, BASELINE, prefix(state.open).trimEnd(), STYLE) +
    // Hours of the day of the next event (after closing, that is tomorrow), so no "heute".
    text(box.w, BASELINE, `Öffnungszeiten ${state.hours[0]} – ${state.hours[1]}`, TYPE.caption, { anchor: "end" });
  if (withCountdown) {
    const c = countdownBox(box, state.open);
    svg += `<g transform="translate(${c.x} ${c.y})">${countdownSvg(box, state.minutes)}</g>`;
  }
  return svg;
}
