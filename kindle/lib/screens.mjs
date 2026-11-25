// ============================================================
// kindle/lib/screens.mjs — the screens (Phase 8; tiles, Phase 14; one
// screen per Kindle, Phase 15)
// A screen is a set of tiles on the 8 × 4 grid (design.mjs GRID,
// cell()), each filled by a module. Tiles don't overlap, so on the
// Kindle each can be pasted on its own cadence. Every screen keeps two
// tiles in the same cells: the date (0, 0) — the "Aktualisiere …" piece
// goes there — and the Feld (0, 1), so all screens share one set of
// Kindle-drawn pieces.
// ============================================================

import { cell, TILE_PAD, text, tile, TILE_INK, TILE_TYPE, firstBaseline } from "./design.mjs";
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
 * x/y/w/h its content (TILE_PAD inside). `tone` is the tile's style
 * (design.mjs tile()); a "bleed" tile has no container, and its module may
 * draw graphics into the padding (box.bleed) while text keeps the inset.
 */
function T(module, [col, row, cols = 1, rows = 1], opts = {}) {
  const r = cell(col, row, cols, rows);
  return { module, tile: r, x: r.x + TILE_PAD, y: r.y + TILE_PAD, w: r.w - 2 * TILE_PAD, h: r.h - 2 * TILE_PAD, bleed: opts.tone === "bleed" ? TILE_PAD : 0, ...opts };
}

// The tiles every screen shares.
const DATE = T("datum", [0, 0, 2, 1], { tone: "dark" });
/** Kindle-drawn: `variant` names its piece set; one set serves every screen (same cell, same tone). */
const FELD = T("tempelhof", [0, 1, 2, 1], { variant: "feld", tone: "fill" });

/**
 * The screens, by id: name (shown on the admin page) and tiles. Each
 * Kindle shows one (its config's `screen`); both show "home" for now.
 * The cards change with the time of day themselves (the Feld countdown,
 * tomorrow's films from 22:00).
 */
export const SCREENS = {
  home: {
    name: "Start",
    boxes: [
      DATE, FELD,
      T("wetter", [2, 0, 2, 2], { variant: "mixed", tone: "fill" }),
      T("ausdruck", [4, 0, 4, 2], { tone: "light" }),
      T("kino", [0, 2, 4, 2], { tone: "light" }),
      T("fitness", [4, 2, 2, 2], { variant: "person", person: "Matt", tone: "dark" }),
      T("fitness", [6, 2, 2, 2], { variant: "person", person: "Fiona", tone: "dark" }),
    ],
  },
};

/** Modules the Kindle draws itself (prebuilt, updated every minute); the rest come from the server. */
export const DEVICE_MODULES = new Set(["tempelhof"]);

const LABELS = { datum: "Datum", wetter: "Wetter", kino: "Im Kino", ausdruck: "Ausdruck des Tages", tempelhof: "Tempelhofer Feld", fitness: "Bewegung", praeposition: "Präposition des Tages" };

/** Screens whose content goes stale within the hour (weather, fitness) — the Kindle checks in on the interval. */
export const HOURLY_SCREENS = Object.keys(SCREENS).filter((id) => SCREENS[id].boxes.some((b) => MODULES[b.module].cadence === "hourly"));

/** The box a module lays out in: its content box, origin at the top left. The build uses it too. */
export const moduleBox = (b) => ({ w: b.w, h: b.h, variant: b.variant, tone: b.tone, person: b.person, bleed: b.bleed ?? 0 });

/** The Kindle-drawn boxes of a screen. */
export const deviceBoxes = (id) => SCREENS[id].boxes.filter((b) => DEVICE_MODULES.has(b.module));

/** Placeholder for a server module when the Kindle has no downloaded screen (the date tile says why). */
function placeholder(box, module) {
  return text(0, firstBaseline(TILE_TYPE.label.size), box.person ?? LABELS[module], { ...TILE_TYPE.label, ink: box.tone === "dark" ? "#aaaaaa" : TILE_INK.muted });
}

/** A tile: its background, then `inner` (module coordinates) placed in its content box. */
export function boxSvg(b, inner) {
  return tile(b.tile, b.tone ?? "outline") + `<g transform="translate(${b.x} ${b.y})">${inner}</g>`;
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
  if (b.module === "kino") return kino.render(box, data.kino.programme, { date: data.kino.date ?? data.date, day: data.kino.day ?? "heute", from: data.kino.from });
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
 */
export function screenSvg(id, data, mode = "full") {
  let svg = svgOpen(W, H);
  for (const b of SCREENS[id].boxes) {
    if (DEVICE_MODULES.has(b.module) && mode !== "full") continue;
    svg += boxSvg(b, moduleSvg(b, data, mode));
  }
  return svg + "</svg>";
}
