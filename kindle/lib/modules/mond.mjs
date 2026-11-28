// ============================================================
// Module: Mond (Phase 17)
// The moon around today ("Mondphasen"): five moons of one size in a row,
// drawn in detail (maria, a near-black dark side) — the two phases before
// today, today, the two after — each over its date (today's in a pill).
// A wide card (2 × 1). No network: the phases come from Meeus,
// "Astronomical Algorithms" ch. 49 (the main periodic terms; good to a few
// minutes), the illumination from the moon's age.
//
// Cadence: daily.
// ============================================================

import { firstBaseline, pill, PILL, text, TILE_INK, TILE_TYPE } from "../design.mjs";
import { berlinParts } from "../schedule.mjs";

export const id = "mond";
export const cadence = "daily";
export const sizes = ["wide"];

const SYNODIC = 29.530588861; // days
const rad = (d) => (d * Math.PI) / 180;
const jdToMs = (jd) => (jd - 2440587.5) * 86_400_000;

/**
 * The moment of a principal phase (Meeus ch. 49): k an integer for a new
 * moon, + 0.25 first quarter, + 0.5 full, + 0.75 last quarter (k = 0 is the
 * new moon of 6 January 2000). Returns ms since the epoch (TT ≈ UTC here).
 */
export function phaseTime(k) {
  const T = k / 1236.85;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T ** 2 - 0.00000015 * T ** 3 + 0.00000000073 * T ** 4;
  const E = 1 - 0.002516 * T - 0.0000074 * T ** 2;
  const M = rad(2.5534 + 29.1053567 * k - 0.0000014 * T ** 2 - 0.00000011 * T ** 3);
  const Mp = rad(201.5643 + 385.81693528 * k + 0.0107582 * T ** 2 + 0.00001238 * T ** 3 - 0.000000058 * T ** 4);
  const F = rad(160.7108 + 390.67050284 * k - 0.0016118 * T ** 2 - 0.00000227 * T ** 3 + 0.000000011 * T ** 4);
  const O = rad(124.7746 - 1.56375588 * k + 0.0020672 * T ** 2 + 0.00000215 * T ** 3);
  const s = Math.sin;
  const frac = ((k % 1) + 1) % 1;
  if (frac === 0 || frac === 0.5) {
    const full = frac === 0.5;
    jde +=
      (full ? -0.40614 : -0.4072) * s(Mp) + (full ? 0.17302 : 0.17241) * E * s(M) + (full ? 0.01614 : 0.01608) * s(2 * Mp) +
      (full ? 0.01043 : 0.01039) * s(2 * F) + (full ? 0.00734 : 0.00739) * E * s(Mp - M) - (full ? 0.00515 : 0.00514) * E * s(Mp + M) +
      (full ? 0.00209 : 0.00208) * E * E * s(2 * M) - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F) + 0.00056 * E * s(2 * Mp + M) -
      0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F) + 0.00038 * E * s(M - 2 * F) - 0.00024 * E * s(2 * Mp - M) - 0.00017 * s(O);
  } else {
    jde +=
      -0.62801 * s(Mp) + 0.17172 * E * s(M) - 0.01183 * E * s(Mp + M) + 0.00862 * s(2 * Mp) + 0.00804 * s(2 * F) +
      0.00454 * E * s(Mp - M) + 0.00204 * E * E * s(2 * M) - 0.0018 * s(Mp - 2 * F) - 0.0007 * s(Mp + 2 * F) - 0.0004 * s(3 * Mp) -
      0.00034 * E * s(2 * Mp - M) + 0.00032 * E * s(M + 2 * F) + 0.00032 * E * s(M - 2 * F) - 0.00028 * E * E * s(Mp + 2 * M) +
      0.00027 * E * s(2 * Mp + M) - 0.00017 * s(O);
    const c = Math.cos;
    const W = 0.00306 - 0.00038 * E * c(M) + 0.00026 * c(Mp) - 0.00002 * c(Mp - M) + 0.00002 * c(Mp + M) + 0.00002 * c(2 * F);
    jde += frac === 0.25 ? W : -W;
  }
  return jdToMs(jde);
}

/** The principal phases: their German names, by quarter (0 new, 1 first quarter, 2 full, 3 last quarter). */
export const PHASES = ["Neumond", "Erstes Viertel", "Vollmond", "Letztes Viertel"];

/**
 * The moon at `ms`: { age (days since new moon), fraction (0 new → 0.5 full
 * → 1), lit (0–1), name, next: [{ quarter, at }] × 4 }.
 */
export function moonState(ms) {
  // The new moon at or before ms, by Meeus' k.
  let k = Math.floor((ms - phaseTime(0)) / (SYNODIC * 86_400_000));
  while (phaseTime(k + 1) <= ms) k++;
  while (phaseTime(k) > ms) k--;
  const newMoon = phaseTime(k);
  const age = (ms - newMoon) / 86_400_000;
  const fraction = age / SYNODIC;
  const lit = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
  // The next four principal phases after ms.
  const next = [];
  for (let q = 1; next.length < 4; q++) {
    const at = phaseTime(k + q / 4);
    if (at > ms) next.push({ quarter: q % 4, at });
  }
  return { at: ms, age, fraction, lit, name: phaseName(ms, k), next };
}

/** A principal phase's name within a day of it; otherwise the waxing/waning crescent or gibbous moon. */
function phaseName(ms, k) {
  for (let q = 0; q <= 4; q++) {
    if (Math.abs(phaseTime(k + q / 4) - ms) < 86_400_000) return PHASES[q % 4];
  }
  const f = (ms - phaseTime(k)) / (SYNODIC * 86_400_000);
  return f < 0.25 ? "Zunehmende Sichel" : f < 0.5 ? "Zunehmender Mond" : f < 0.75 ? "Abnehmender Mond" : "Abnehmende Sichel";
}

/**
 * The maria (the dark "seas") as seen from the north, on the unit disc
 * (x right, y down): [cx, cy, rx, ry, rotation°]. Rough, but where they
 * really are, so the moon reads as the moon.
 */
const MARIA = [
  [-0.3, -0.45, 0.3, 0.24, -20], // Imbrium
  [0.18, -0.38, 0.17, 0.15, 0], // Serenitatis
  [0.36, -0.1, 0.21, 0.17, 20], // Tranquillitatis
  [0.68, -0.3, 0.11, 0.09, 0], // Crisium
  [0.55, 0.16, 0.13, 0.17, 10], // Fecunditatis
  [0.33, 0.31, 0.09, 0.08, 0], // Nectaris
  [-0.58, -0.05, 0.25, 0.42, 10], // Oceanus Procellarum
  [-0.17, 0.4, 0.17, 0.12, 0], // Nubium
  [-0.46, 0.4, 0.09, 0.08, 0], // Humorum
  [0.0, -0.73, 0.42, 0.07, 0], // Frigoris
  [0.0, 0.05, 0.08, 0.06, 0], // Sinus Medii
];
let moonId = 0;

/**
 * The moon at (cx, cy), radius r, for `fraction` (0 new → 0.5 full → 1),
 * drawn in detail: the dark side near-black, the lit part (on the right
 * while waxing, as seen from the north, between the limb and the
 * terminator) shaded with gradients — brighter in the middle, darker at the
 * rim, fading into the dark side at the terminator — with soft maria, and
 * an outline.
 */
export function moonSvg(cx, cy, r, fraction, { dark = "#222222", light = "#eeeeee", mare = "#999999", stroke = 4 } = {}) {
  const f = ((fraction % 1) + 1) % 1;
  const e = Math.abs(r * Math.cos(2 * Math.PI * f)); // the terminator's half-width
  const waxing = f < 0.5;
  const crescent = f < 0.25 || f > 0.75;
  const top = `${cx} ${cy - r}`, bottom = `${cx} ${cy + r}`;
  // The limb: the lit half, top to bottom (right while waxing, left while waning);
  // then the terminator back up, bulging toward the lit side for a crescent.
  const limbSweep = waxing ? 1 : 0;
  const termSweep = waxing ? (crescent ? 0 : 1) : crescent ? 1 : 0;
  const id = `moon${++moonId}`;
  const litPath = `M ${top} A ${r} ${r} 0 0 ${limbSweep} ${bottom} A ${e.toFixed(2)} ${r} 0 0 ${termSweep} ${top} Z`;
  // Each mare pulled halfway toward a circle, so the shapes read rounder.
  const maria = MARIA.map(([x, y, ex, ey, rot]) => [x, y, (3 * ex + ey) / 4, (ex + 3 * ey) / 4, rot]).map(([x, y, rx, ry, rot]) =>
    `<ellipse cx="${(cx + x * r).toFixed(1)}" cy="${(cy + y * r).toFixed(1)}" rx="${(rx * r).toFixed(1)}" ry="${(ry * r).toFixed(1)}" transform="rotate(${rot} ${(cx + x * r).toFixed(1)} ${(cy + y * r).toFixed(1)})"/>`).join("");
  const soft = (k) => `<feGaussianBlur stdDeviation="${(r * k).toFixed(2)}"/>`;
  // Gradients: the lit face brighter in the middle and darker toward the rim (limb darkening),
  // and the lit part fading into the dark side at the terminator (a blurred mask) rather than ending sharply.
  const defs = `<defs>` +
    `<radialGradient id="${id}-face" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${light}"/><stop offset="0.7" stop-color="#dddddd"/><stop offset="1" stop-color="#aaaaaa"/></radialGradient>` +
    `<filter id="${id}-soft" x="-20%" y="-20%" width="140%" height="140%">${soft(0.07)}</filter>` +
    `<filter id="${id}-edge" x="-20%" y="-20%" width="140%" height="140%">${soft(0.06)}</filter>` +
    `<clipPath id="${id}-disc"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>` +
    `<mask id="${id}-lit" maskUnits="userSpaceOnUse" x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}"><path d="${litPath}" fill="#ffffff" filter="url(#${id}-edge)"/></mask>` +
    `</defs>`;
  return defs +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${dark}"/>` +
    `<g clip-path="url(#${id}-disc)"><g mask="url(#${id}-lit)"><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-face)"/><g fill="${mare}" filter="url(#${id}-soft)">${maria}</g></g></g>` +
    `<circle cx="${cx}" cy="${cy}" r="${r - stroke / 2}" fill="none" stroke="${dark}" stroke-width="${stroke}"/>`;
}

/** A Berlin date, short and German, no period after the month: "4. Dez" */
const MONTHS = ["Jan", "Feb", "März", "Apr", "Mai", "Juni", "Juli", "Aug", "Sept", "Okt", "Nov", "Dez"];
const deShort = (ms) => {
  const p = berlinParts(ms);
  return `${p.d}. ${MONTHS[p.m - 1]}`;
};

/**
 * The eight phases' moments around ms, in order: the quarters from Meeus,
 * the crescents and gibbous moons halfway between them. [{ eighth, at }]
 */
function eighths(ms) {
  let k = Math.floor((ms - phaseTime(0)) / (SYNODIC * 86_400_000));
  const out = [];
  for (let c = k - 1; c <= k + 2; c++) {
    const q = [0, 1, 2, 3, 4].map((i) => phaseTime(c + i / 4));
    for (let i = 0; i < 4; i++) out.push({ eighth: 2 * i, at: q[i] }, { eighth: 2 * i + 1, at: (q[i] + q[i + 1]) / 2 });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The moons on the card: the two phases before today, today, the two after (a phase within a day of today is today). */
export function strip(state) {
  const all = eighths(state.at).filter((e) => Math.abs(e.at - state.at) >= 86_400_000);
  const before = all.filter((e) => e.at < state.at).slice(-2);
  const after = all.filter((e) => e.at > state.at).slice(0, 2);
  const today = { at: state.at, today: true, fraction: state.fraction };
  return [...before, today, ...after].map((e) => ({ ...e, fraction: e.fraction ?? e.eighth / 8 }));
}

/**
 * The card for `state` (moonState): the title (centred), then five moons of one size
 * in a row — the two phases before today, today, the two after — each over
 * its date (small bold, muted; today's in a black pill) on the bottom edge.
 */
export function render(box, state) {
  if (!state) return "";
  const moons = strip(state);
  const col = box.w / moons.length;
  const small = { ...TILE_TYPE.small, weight: "bold", ink: TILE_INK.muted };
  const titleY = firstBaseline(TILE_TYPE.label.size);
  const dateY = box.h - (PILL.h - PILL.above); // the dates (and today's pill) on the bottom edge
  // The moons between the title and the dates.
  const top = titleY + 16, bottom = dateY - PILL.above - 10;
  // The moons at 90 % of what fits, for air around them.
  const r = Math.round(0.9 * Math.min(col / 2 - 10, (bottom - top) / 2));
  const cy = (top + bottom) / 2;
  let svg = text(box.w / 2, titleY, "Mondphasen", TILE_TYPE.label, { anchor: "middle" });
  moons.forEach((m, i) => {
    const cx = col * i + col / 2;
    svg += moonSvg(cx, cy, r, m.fraction);
    const date = deShort(m.at);
    if (m.today) {
      const w = pill(0, 0, date).w;
      svg += pill(cx - w / 2, dateY, date).svg;
    } else {
      svg += text(cx, dateY, date, small, { anchor: "middle" });
    }
  });
  return svg;
}
