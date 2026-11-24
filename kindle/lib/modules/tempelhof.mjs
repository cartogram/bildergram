// ============================================================
// Module: Tempelhofer Feld (Phase 8)
// Open/closed state, a countdown to the next opening or closing,
// and the day's hours. The countdown sits in its own sub-box
// (countdownBox) so the Kindle can paste a new one every minute
// over an otherwise unchanged screen.
//
// Cadence: minute (countdown), changes state twice a day.
// Data: kindle/lib/schedule.mjs → tempelhofState(events, ms).
// ============================================================

import { INK, TYPE, deCountdown, fitSize, label, pill, text, underlined } from "../design.mjs";

export const id = "tempelhof";
export const cadence = "minute";

/** The longest countdown the schedule produces ("17 h 0 min" in June). */
const WIDEST = "17 h 59 min";

/** Layout inside a box; shared by render() and the countdown pieces. */
function layout(box) {
  const heroSize = Math.min(box.variant === "full" ? TYPE.hero.size : TYPE.display.size, fitSize(WIDEST, TYPE.hero, box.w));
  // Pill + countdown + "bis zur …" form one group, centred between the
  // label (top) and the hours caption (bottom).
  const groupH = 68 + 72 + Math.round(heroSize * 1.1) + 64;
  const pillY = Math.max(64, Math.round(60 + (box.h - 120 - groupH) / 2));
  const heroTop = pillY + 68 + 72;
  return {
    pillY,
    heroSize,
    // The countdown sub-box: tall enough for the hero line, full box width.
    countdownBox: { x: 0, y: heroTop, w: box.w, h: Math.round(heroSize * 1.1) },
    untilY: heroTop + Math.round(heroSize * 1.1) + 64,
  };
}

/** The countdown line alone, drawn into countdownBox(box) coordinates. */
export function countdownSvg(box, minutes) {
  const l = layout(box);
  return text(0, Math.round(l.heroSize * 0.88), deCountdown(minutes), { size: l.heroSize, weight: "bold" });
}

export function countdownBox(box) {
  return layout(box).countdownBox;
}

/**
 * Everything except the countdown (the static part for this state),
 * plus the countdown itself unless `withCountdown` is false.
 */
export function render(box, state, { withCountdown = true } = {}) {
  const l = layout(box);
  // Open: the black pill. Closed: the same word underlined, quieter.
  const p = state.open ? pill(0, l.pillY, "GEÖFFNET") : underlined(0, l.pillY, "GESCHLOSSEN");
  const until = state.open ? `bis zur Schließung um ${state.target}` : `bis zur Öffnung um ${state.target}`;
  const untilSize = fitSize(until, TYPE.title, box.w);
  let svg =
    label(0, 30, "Tempelhofer Feld") +
    p.svg +
    text(0, l.untilY, until, { ...TYPE.title, size: untilSize }, { ink: INK.secondary }) +
    // Hours of the day of the next event (after closing, that is tomorrow), so no "heute".
    text(0, box.h - 8, `Öffnungszeiten ${state.hours[0]} – ${state.hours[1]}`, TYPE.caption);
  if (withCountdown) {
    const c = l.countdownBox;
    svg += `<g transform="translate(${c.x} ${c.y})">${countdownSvg(box, state.minutes)}</g>`;
  }
  return svg;
}
