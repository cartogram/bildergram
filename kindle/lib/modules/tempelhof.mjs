// ============================================================
// Module: Tempelhofer Feld (Phase 8; a tile since Phase 14)
// A 2 × 1 tile: "Feld schließt in" over the countdown, both in the label
// style, and a half-circle gauge of GAUGE_STEPS dots from the last
// opening/closing (left time) to the next (right time), the stretch
// still to go in ink.
//   open   — the ring as an "n" on top, the times at its feet, the text below;
//   closed — the text on top, the times, the ring as a "u" below.
// The Kindle draws this tile itself: the build makes a panel per state
// key, a countdown per minute and a gauge per pair of times and step,
// each placed per state (countdownBox, gaugeBox).
//
// Cadence: minute (countdown), changes state twice a day.
// Data: kindle/lib/schedule.mjs → tempelhofState(events, ms).
// ============================================================

import { deCountdown, firstBaseline, pill, PILL, text, TILE_INK, TILE_INK_DARK, TILE_TYPE } from "../design.mjs";

export const id = "tempelhof";
export const cadence = "minute";

const LABEL = TILE_TYPE.label;
const LEAD = 32;
/** The times' line sits a little further from the text than LEAD, to make room for the pills. */
const TIME_LEAD = LEAD + 6;
const DOT = 3;

/** Gauge dots; the device computes the step the same way (dashboard.sh). */
export const GAUGE_STEPS = 18;
/** Every Feld tile has the gauge (the build asks). */
export const hasGauge = () => true;

const verb = (open) => (open ? "Feld schließt in" : "Feld öffnet in");
/** The two lines' baselines per state: at the bottom when open, the top when closed. */
const lines = (box, open) => (open ? [box.h - LEAD, box.h] : [firstBaseline(LABEL.size), firstBaseline(LABEL.size) + LEAD]);

/** The tile's inks: on paper, or inverted on a dark tile ("gone": the dots for time passed). */
const palette = (box) => (box.tone === "dark" ? { ...TILE_INK_DARK, gone: TILE_INK_DARK.faint } : { ...TILE_INK, gone: "#bbbbbb" });

// ------------------------------------------------------------------
// Gauge
// ------------------------------------------------------------------

/**
 * The gauge: the times' baseline `ty`, and the half circle through the
 * dots' centres — centre (cx, cy) level with the pills' middle (the pills
 * overlap its ends), radius r as wide as the tile allows; `dir` −1 bulges
 * up ("n"), +1 down ("u"). On a "bleed" tile the ring may reach into the
 * padding (box.bleed), up to 4 px from the tile's edge.
 */
function arc(box, open) {
  const cx = box.w / 2;
  const out = box.bleed ? box.bleed - 4 : 0;
  if (open) {
    const ty = lines(box, true)[0] - TIME_LEAD;
    const cy = ty - PILL.above + PILL.h / 2;
    return { ty, cx, cy, r: Math.min(cx + out, cy + out) - DOT, dir: -1 };
  }
  const ty = lines(box, false)[1] + TIME_LEAD;
  const cy = ty - PILL.above + PILL.h / 2;
  // Without a bleed, the ring may reach 8 px past the content box.
  return { ty, cx, cy, r: Math.min(cx + out, box.h + (out || 8) - cy) - DOT, dir: 1 };
}

/** The gauge piece's rect (box coordinates): the ring and the times' line. */
export function gaugeBox(box, open = true) {
  const a = arc(box, open);
  const b = box.bleed ?? 0;
  const top = open ? Math.floor(a.cy - a.r - DOT - 2) : a.ty - PILL.above - 1;
  const bottom = open ? a.ty - PILL.above + PILL.h + 1 : Math.ceil(a.cy + a.r + DOT + 2);
  return { x: -b, y: top, w: box.w + 2 * b, h: bottom - top };
}

/** The step (0–GAUGE_STEPS) for a state's progress. */
export const gaugeStep = (state) => Math.max(0, Math.min(GAUGE_STEPS, Math.floor((state.progress ?? 0) * GAUGE_STEPS)));

/** The gauge at `step`, labelled `since` (left) and `target` (right). */
export function gaugeSvg(box, since, target, step, open = true) {
  const { ty, cx, cy, r, dir } = arc(box, open);
  const P = palette(box);
  // The times in pills on their own line, flush left and right; inverted on a dark tile.
  const inv = box.tone === "dark" ? { fill: P.ink, ink: P.paper } : {};
  const pills = [since && pill(0, ty, since, inv), pill(box.w, ty, target, { right: true, ...inv })].filter(Boolean);
  // Dots a pill overlaps (with 4 px of air) are left out, so the pill cleanly interrupts the ring.
  const air = DOT + 4;
  const hidden = (x, y) => pills.some((p) => x + air > p.x && x - air < p.x + p.w && y + air > p.y && y - air < p.y + PILL.h);
  let svg = "";
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

/** The countdown sub-box: the second line, so its place differs per state. */
export function countdownBox(box, open = true) {
  return { x: 0, y: lines(box, open)[1] - LABEL.size, w: box.w, h: Math.round(LABEL.size * 1.3) };
}

/** The countdown alone, drawn into countdownBox() coordinates. */
export function countdownSvg(box, minutes) {
  return text(0, LABEL.size, deCountdown(minutes), { ...LABEL, ink: palette(box).ink });
}

// ------------------------------------------------------------------
// Tile
// ------------------------------------------------------------------

/**
 * The tile for this state, plus the countdown unless `withCountdown` is
 * false (the Kindle pastes it) and the gauge unless `withGauge` is false.
 */
export function render(box, state, { withCountdown = true, withGauge = true } = {}) {
  let svg = text(0, lines(box, state.open)[0], verb(state.open), { ...LABEL, ink: palette(box).ink });
  if (withGauge) svg += gaugeSvg(box, state.since, state.target, gaugeStep(state), state.open);
  if (withCountdown) {
    const c = countdownBox(box, state.open);
    svg += `<g transform="translate(${c.x} ${c.y})">${countdownSvg(box, state.minutes)}</g>`;
  }
  return svg;
}
