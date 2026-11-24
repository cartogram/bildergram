// ============================================================
// kindle/lib/screens.mjs — the screens (Phase 8; fitness on Nacht,
// Phase 12; tiles, Phase 14)
// Each screen is a set of tiles on the 8 × 4 grid (design.mjs GRID,
// cell()), each filled by a module. Tiles don't overlap, so on the
// Kindle each can be pasted on its own cadence. The date tile sits in
// cell (0, 0) on every screen (the "Aktualisiere …" piece goes there).
// ============================================================

import { cell, TILE_PAD, TITLE_SPACE, TYPE, text, tile } from "./design.mjs";
import { svgOpen, W, H } from "./eink.mjs";
import * as ausdruck from "./modules/ausdruck.mjs";
import * as datum from "./modules/datum.mjs";
import * as fitness from "./modules/fitness.mjs";
import * as kino from "./modules/kino.mjs";
import * as praeposition from "./modules/praeposition.mjs";
import * as tempelhof from "./modules/tempelhof.mjs";
import * as wetter from "./modules/wetter.mjs";

export const MODULES = { ausdruck, datum, fitness, kino, praeposition, tempelhof, wetter };

/**
 * A tile at cell (col, row) spanning cols × rows: `tile` is its rect,
 * x/y/w/h its content (TILE_PAD inside). `tone` overrides the screen's tile
 * style for this tile; a "bleed" tile has no container, and its module may
 * draw graphics into the padding (box.bleed) while text keeps the inset.
 */
function T(module, [col, row, cols = 1, rows = 1], opts = {}) {
  const r = cell(col, row, cols, rows);
  return { module, tile: r, x: r.x + TILE_PAD, y: r.y + TILE_PAD, w: r.w - 2 * TILE_PAD, h: r.h - 2 * TILE_PAD, bleed: opts.tone === "bleed" ? TILE_PAD : 0, ...opts };
}
const DATE = T("datum", [0, 0, 2, 1], { tone: "dark" });

/**
 * name (German, shown on the admin page), tile style ("outline" or
 * "fill"; the date tile is always dark) and tiles.
 */
export const SCREENS = {
  morgen: {
    name: "Morgen",
    style: "outline",
    boxes: [
      DATE,
      // Kindle-drawn: `variant` names its piece set (the build makes one per variant).
      T("tempelhof", [0, 1, 2, 1], { variant: "morgen", tone: "fill" }),
      T("wetter", [2, 0, 2, 2], { variant: "mixed", tone: "fill" }),
      T("ausdruck", [4, 0, 4, 2], { variant: "card", tone: "light" }),
      T("kino", [0, 2, 4, 2], { variant: "tonight", tone: "light" }),
      // Each person's exercise rings, inverted.
      T("fitness", [4, 2, 2, 2], { variant: "person", person: "Matt", tone: "dark" }),
      T("fitness", [6, 2, 2, 2], { variant: "person", person: "Fiona", tone: "dark" }),
    ],
  },
  // Tag, Abend and Nacht are the old screens' modules on tiles, not designed yet.
  tag: {
    name: "Tag",
    style: "outline",
    boxes: [DATE, T("tempelhof", [2, 0, 6, 2], { variant: "tag" }), T("praeposition", [0, 2, 8, 2], { variant: "wide" })],
  },
  abend: {
    name: "Abend",
    style: "outline",
    boxes: [DATE, T("kino", [2, 0, 6, 4], { variant: "full" })],
  },
  nacht: {
    name: "Nacht",
    style: "outline",
    boxes: [DATE, T("ausdruck", [2, 0, 6, 2], { variant: "wide" }), T("fitness", [0, 2, 8, 2], { variant: "wide" })],
  },
};

/** Modules the Kindle draws itself (prebuilt, updated every minute); the rest come from the server. */
export const DEVICE_MODULES = new Set(["tempelhof"]);

const LABELS = { datum: "Datum", wetter: "Wetter", kino: "Im Kino", ausdruck: "Ausdruck des Tages", tempelhof: "Tempelhofer Feld", fitness: "Bewegung diese Woche", praeposition: "Präposition des Tages" };

/** Screens whose content goes stale within the hour (weather, fitness) — the Kindle checks in on the interval. */
export const HOURLY_SCREENS = Object.keys(SCREENS).filter((id) => SCREENS[id].boxes.some((b) => MODULES[b.module].cadence === "hourly"));

/**
 * The box a module lays out in: TITLE_SPACE taller than its screen box,
 * drawn shifted up by TITLE_SPACE (see design.mjs). The build uses it too.
 */
export const moduleBox = (b) => ({ w: b.w, h: b.h + TITLE_SPACE, variant: b.variant, tone: b.tone, person: b.person, bleed: b.bleed ?? 0 });

/** The Kindle-drawn boxes of a screen. */
export const deviceBoxes = (id) => SCREENS[id].boxes.filter((b) => DEVICE_MODULES.has(b.module));

/** Placeholder for a server module when the Kindle has no downloaded screen (the date tile says why). */
function placeholder(box, module) {
  return text(0, TITLE_SPACE + 30, LABELS[module], TYPE.caption);
}

/** A tile: its background, then `inner` (module coordinates) placed in its content box. */
export function boxSvg(b, inner, style = "outline") {
  return tile(b.tile, b.tone ?? style) + `<g transform="translate(${b.x} ${b.y - TITLE_SPACE})">${inner}</g>`;
}

/** One tile's content (module coordinates) for `data` in `mode` (see screenSvg). */
export function moduleSvg(b, data, mode = "full") {
  const box = moduleBox(b);
  const onDevice = DEVICE_MODULES.has(b.module);
  if (b.module === "datum") return datum.render(box, mode === "fallback" ? {} : { date: data.date, battery: data.battery });
  if (mode === "fallback" && !onDevice) return placeholder(box, b.module);
  if (b.module === "tempelhof") return tempelhof.render(box, data.tempelhof);
  if (b.module === "wetter") return wetter.render(box, data.wetter);
  if (b.module === "ausdruck") return ausdruck.render(box, data.ausdruck);
  if (b.module === "praeposition") return praeposition.render(box, data.praeposition);
  if (b.module === "fitness") return fitness.render(box, data.fitness, { date: data.date });
  if (b.module === "kino") return kino.render(box, data.kino.programme, { date: data.kino.date ?? data.date, day: data.kino.day, from: data.kino.from });
  return "";
}

/** A tile for `module` at cell (col, row) spanning cols × rows (the design page builds its own). */
export const tileAt = (module, rect, opts) => T(module, rect, opts);

/**
 * Render a screen to SVG. `data` supplies each module's input:
 * { date, battery, tempelhof: state, wetter: weather, kino: { programme, from, updated },
 *   ausdruck: entry, praeposition: entry, fitness: { people } }
 *
 * mode "full"     — everything (gallery, admin preview)
 *      "base"     — Kindle-drawn tiles left blank (the server's image for the Kindle)
 *      "fallback" — no data: the date tile says "Keine Verbindung", the others show their name
 * `style` overrides the screen's tile style (the gallery compares them).
 */
export function screenSvg(id, data, mode = "full", { style } = {}) {
  const s = SCREENS[id];
  style ??= s.style;
  let svg = svgOpen(W, H);
  for (const b of s.boxes) {
    if (DEVICE_MODULES.has(b.module) && mode !== "full") continue;
    svg += boxSvg(b, moduleSvg(b, data, mode), style);
  }
  return svg + "</svg>";
}
