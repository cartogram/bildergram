// ============================================================
// Module: Tempelhofer Feld (Phase 8; a tile since Phase 14)
// The Feld's state, "schließt in" / "öffnet in" and the countdown. The
// countdown sits in its own sub-box (countdownBox) so the Kindle can
// paste a new one every minute; the build makes a countdown set per
// state.
//
// Short tiles (Morgen) are mostly a gauge: GAUGE_STEPS dots on a
// half circle as wide as the tile, from the last opening/closing (left
// time) to the next (right time), the stretch still to go in black.
//   open   — the ring as an "n" on top, the times at its feet, two lines below;
//   closed — two lines on top, the times, the ring as a "u" below;
// the lines read "Feld öffnet in" over "1h 30min", both in the label style.
// The Kindle pastes a gauge piece (gaugeBox) per state, pair of times
// and step.
//
// Tall tiles (Tag) have a label, the state, the verb and the countdown
// large; a 1-column tall tile wraps the countdown after the hours.
//
// Cadence: minute (countdown), changes state twice a day.
// Data: kindle/lib/schedule.mjs → tempelhofState(events, ms).
// ============================================================

import { deCountdown, firstBaseline, pill, PILL, text, TILE_INK, TILE_INK_DARK, TILE_TYPE, TITLE_SPACE, TYPE, width } from "../design.mjs";

export const id = "tempelhof";
export const cadence = "minute";

/** The longest countdown the schedule produces ("17h 0min" in June). */
const WIDEST = "17h 59min";
const contentH = (box) => box.h - TITLE_SPACE;
/** Short tiles (half a 2 × 2): the gauge layouts. */
const short = (box) => contentH(box) < 300;
/** Tall narrow tiles wrap the countdown after the hours. */
const wraps = (box) => box.w < 500 && !short(box);
const verb = (open) => (open ? "schließt in " : "öffnet in ");
/** Short tiles: "Feld schließt in" over the countdown, both in the label style. */
const shortVerb = (open) => `Feld ${verb(open).trimEnd()}`;
const LABEL = TILE_TYPE.label;
const LEAD = 32;
/** Short tiles: the two lines' baselines (content coordinates) per state — at the bottom when open, the top when closed. */
const lines = (box, open) => (open ? [contentH(box) - LEAD, contentH(box)] : [firstBaseline(LABEL.size), firstBaseline(LABEL.size) + LEAD]);

// ------------------------------------------------------------------
// Gauge (short tiles)
// ------------------------------------------------------------------

/** Gauge ticks; the device computes the step the same way (dashboard.sh). */
export const GAUGE_STEPS = 18;
/** Does this tile have the gauge? */
export const hasGauge = (box) => short(box);

const DOT = 3;
// The times sit in pills (design.mjs pill(), PILL: 32 high, 23 above the baseline).
/** The times' line sits a little further from the text than LEAD, to make room for the pills. */
const TIME_LEAD = LEAD + 6;

/**
 * The gauge in module coordinates: the times' baseline `ty`, and the half
 * circle through the dots' centres — centre (cx, cy) on the line through
 * both ends, radius r as wide as the tile; `dir` −1 bulges up ("n"), +1
 * down ("u").
 *   open:   the ring from the top, the times under its ends, the verb line;
 *   closed: the verb line, the times, the ring down past the content box.
 */
function arc(box, open) {
  const cx = box.w / 2;
  // On a bleed tile the ring may reach into the padding (box.bleed), up to 4 px from the tile's edge.
  const out = box.bleed ? box.bleed - 4 : 0;
  if (open) {
    const ty = TITLE_SPACE + lines(box, true)[0] - TIME_LEAD;
    // The ring's ends level with the pills' middle: the pills overlap it a little.
    const cy = ty - PILL.above + PILL.h / 2;
    return { ty, cx, cy, r: Math.min(cx + out, cy - TITLE_SPACE + out) - DOT, dir: -1 };
  }
  const ty = TITLE_SPACE + lines(box, false)[1] + TIME_LEAD;
  const cy = ty - PILL.above + PILL.h / 2;
  // Without a bleed, the ring may reach 8 px past the content box.
  return { ty, cx, cy, r: Math.min(cx + out, TITLE_SPACE + contentH(box) + (out || 8) - cy) - DOT, dir: 1 };
}

/** The gauge piece's rect (module coordinates): the ring and the times' line. */
export function gaugeBox(box, open = true) {
  const a = arc(box, open);
  const b = box.bleed ?? 0;
  const top = open ? Math.floor(a.cy - a.r - DOT - 2) : a.ty - PILL.above - 1;
  const bottom = open ? a.ty - PILL.above + PILL.h + 1 : Math.ceil(a.cy + a.r + DOT + 2);
  return { x: -b, y: top, w: box.w + 2 * b, h: bottom - top };
}

/** The step (0–GAUGE_STEPS) for a state's progress. */
export const gaugeStep = (state) => Math.max(0, Math.min(GAUGE_STEPS, Math.floor((state.progress ?? 0) * GAUGE_STEPS)));

/** The gauge at `step`, labelled `since` (left) and `target` (right), in module coordinates. */
export function gaugeSvg(box, since, target, step, open = true) {
  const { ty, cx, cy, r, dir } = arc(box, open);
  // The times in pills on their own line: flush left with the text, flush right over the last dot.
  const P = palette(box);
  // Pills invert on a dark tile (light pill, dark text), like the date's Akku.
  const inv = box.tone === "dark" ? { fill: P.ink, ink: P.paper } : {};
  const pills = [since && pill(0, ty, since, inv), pill(box.w, ty, target, { right: true, ...inv })].filter(Boolean);
  // Dots a pill overlaps (with 4 px of air) are left out, so the pill cleanly interrupts the ring.
  const air = DOT + 4;
  const hidden = (x, y) => pills.some((p) => x + air > p.x && x - air < p.x + p.w && y + air > p.y && y - air < p.y + PILL.h);
  let svg = "";
  // One dot per step, left to right: still to go black, behind us light grey.
  for (let i = 0; i < GAUGE_STEPS; i++) {
    const t = Math.PI - ((i + 0.5) / GAUGE_STEPS) * Math.PI;
    const x = cx + Math.cos(t) * r;
    const y = cy + dir * Math.sin(t) * r;
    if (hidden(x, y)) continue;
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${DOT}" fill="${i >= step ? P.ink : P.gone}"/>`;
  }
  for (const p of pills) svg += p.svg;
  return svg;
}

// ------------------------------------------------------------------
// Countdown
// ------------------------------------------------------------------

/**
 * The tile's inks: on paper, or inverted on a dark tile ("gone" is the
 * dots for time already passed).
 */
const palette = (box) => (box.tone === "dark" ? { ...TILE_INK_DARK, gone: TILE_INK_DARK.faint } : { ...TILE_INK, gone: "#bbbbbb" });

/** The countdown's type. */
function countStyle(box) {
  if (short(box)) return { ...LABEL, ink: palette(box).ink };
  const sizes = [120, 104, 96, 88, 80, 72, 64, 56, 52, 48, 44, 40, 36];
  const widest = wraps(box) ? "59min" : WIDEST;
  return { size: sizes.find((s) => width(widest, { size: s, weight: "bold" }) <= box.w) ?? 32, weight: "bold" };
}

/** The countdown sub-box; on a short tile it is the second line, so its place differs per state. */
export function countdownBox(box, open = true) {
  const style = countStyle(box);
  if (short(box)) return { x: 0, y: TITLE_SPACE + lines(box, open)[1] - style.size, w: box.w, h: Math.round(style.size * 1.3) };
  const n = wraps(box) ? 2 : 1;
  return { x: 0, y: TITLE_SPACE + 150, w: box.w, h: Math.round(style.size * 1.15 * n + style.size * 0.1) };
}

/** The countdown alone, drawn into countdownBox() coordinates. */
export function countdownSvg(box, minutes) {
  const style = countStyle(box);
  if (short(box)) return text(0, style.size, deCountdown(minutes), style);
  const lead = Math.round(style.size * 1.15);
  const parts = wraps(box) ? deCountdown(minutes).split(/ (?=\d+min)/) : [deCountdown(minutes)];
  return parts.map((p, i) => text(0, Math.round(style.size * 0.95) + i * lead, p, style)).join("");
}

// ------------------------------------------------------------------
// Tile
// ------------------------------------------------------------------

/**
 * The tile for this state, plus the countdown unless `withCountdown` is
 * false (the Kindle pastes it) and the gauge unless `withGauge` is false.
 */
export function render(box, state, { withCountdown = true, withGauge = true } = {}) {
  const top = TITLE_SPACE;
  let svg = "";
  if (short(box)) {
    svg += text(0, top + lines(box, state.open)[0], shortVerb(state.open), { ...LABEL, ink: palette(box).ink });
    if (withGauge) svg += gaugeSvg(box, state.since, state.target, gaugeStep(state), state.open);
  } else {
    // Hours of the day of the next event (after closing, that is tomorrow), so no "heute".
    svg += text(0, box.h, `${state.hours[0]} – ${state.hours[1]} Uhr`, TYPE.caption) +
      text(0, top + 30, "Tempelhofer Feld", TYPE.caption) +
      text(0, top + 88, state.open ? "Geöffnet" : "Geschlossen", TYPE.strong) +
      text(0, top + 136, verb(state.open).trimEnd(), TYPE.body);
  }
  if (withCountdown) {
    const c = countdownBox(box, state.open);
    svg += `<g transform="translate(${c.x} ${c.y})">${countdownSvg(box, state.minutes)}</g>`;
  }
  return svg;
}
