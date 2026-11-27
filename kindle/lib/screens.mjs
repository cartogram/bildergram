// ============================================================
// kindle/lib/screens.mjs — the screens (Phase 8; tiles, Phase 14; one
// screen per Kindle, Phase 15; a screen each for Matt and Fiona on the
// 6 × 2 grid, Phase 17)
// A screen is a set of tiles on the grid (design.mjs GRID, cell()), each
// filled by a module. Tiles don't overlap, so on the Kindle each can be
// pasted on its own cadence; the bottom row is free for now. Every screen has the date at (0, 0) — the
// "Aktualisiere …" piece goes there; the Feld, when a screen has it,
// sits at (0, 1), so screens share one set of Kindle-drawn pieces.
// Each tile's size (small, medium, large — design.mjs TILE_SIZES) follows
// from its span, and must be one its module draws (Phase 16).
// ============================================================

import { cell, GRID, TILE_PAD, text, tile, TILE_INK, TILE_TYPE, tileSize, firstBaseline } from "./design.mjs";
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
 * A tile at cell (col, row) spanning cols × rows: `tile` is its rect (on
 * screen), x/y the content's top left on screen, w/h the content's size in
 * drawing units — the tile draws at GRID.scale, TILE_PAD (drawing units)
 * inside. toScreen() turns a rect in the content into screen pixels. `tone` is the tile's style
 * (design.mjs tile()); a "bleed" tile has no container, and its module may
 * draw graphics into the padding (box.bleed) while text keeps the inset.
 * `size` follows from the span; T() throws when the module doesn't draw it.
 */
function T(module, [col, row, cols = 1, rows = 1], opts = {}) {
  const r = cell(col, row, cols, rows);
  const size = tileSize(cols, rows);
  if (!MODULES[module].sizes.includes(size)) throw new Error(`${module} at ${cols} × ${rows}: draws ${MODULES[module].sizes.join(", ")}, not ${size ?? "this span"}`);
  const k = GRID.scale;
  return { module, size, tile: r, x: r.x + TILE_PAD * k, y: r.y + TILE_PAD * k, w: r.w / k - 2 * TILE_PAD, h: r.h / k - 2 * TILE_PAD, bleed: opts.tone === "bleed" ? TILE_PAD : 0, ...opts };
}

/** A rect in tile `b`'s content (drawing units) on screen, in pixels. */
export const toScreen = (b, r) => ({ x: b.x + r.x * GRID.scale, y: b.y + r.y * GRID.scale, w: r.w * GRID.scale, h: r.h * GRID.scale });

// The tiles every screen shares.
const DATE = T("datum", [0, 0], { tone: "dark" });
/** Kindle-drawn: `variant` names its piece set; one set serves every screen (same cell, same tone). */
const FELD = T("tempelhof", [0, 1], { variant: "feld", tone: "light" });

/**
 * The screens, by id: name (shown on the admin page) and tiles. Each
 * Kindle shows one (its config's `screen`): Matt's shows "matt", Fiona's
 * "fiona" (Phase 17). Each is three medium columns, read from the right:
 * the person's rings, then Kino or Wetter, then the date over the Feld
 * or the Ausdruck. The cards change with the time of day themselves
 * (the Feld countdown, tomorrow's films from 22:00).
 */
export const SCREENS = {
  matt: {
    name: "Matt",
    boxes: [
      DATE, FELD,
      T("kino", [1, 0, 1, 2], { tone: "light" }),
      T("fitness", [2, 0, 1, 2], { variant: "person", person: "Matt", tone: "dark" }),
    ],
  },
  fiona: {
    name: "Fiona",
    boxes: [
      DATE,
      T("ausdruck", [0, 1], { tone: "light" }),
      T("wetter", [1, 0, 1, 2], { variant: "mixed", tone: "fill" }),
      T("fitness", [2, 0, 1, 2], { variant: "person", person: "Fiona", tone: "dark" }),
    ],
  },
};

/** Modules the Kindle draws itself (prebuilt, updated every minute); the rest come from the server. */
export const DEVICE_MODULES = new Set(["tempelhof"]);

const LABELS = { datum: "Datum", wetter: "Wetter", kino: "Im Kino", ausdruck: "Ausdruck des Tages", tempelhof: "Tempelhofer Feld", fitness: "Bewegung", praeposition: "Präposition des Tages" };

/** Screens whose content goes stale within the hour (weather, fitness) — the Kindle checks in on the interval. */
export const HOURLY_SCREENS = Object.keys(SCREENS).filter((id) => SCREENS[id].boxes.some((b) => MODULES[b.module].cadence === "hourly"));

/** The box a module lays out in: its content box, origin at the top left. The build uses it too. */
export const moduleBox = (b) => ({ w: b.w, h: b.h, size: b.size, variant: b.variant, tone: b.tone, person: b.person, bleed: b.bleed ?? 0 });

/** The Kindle-drawn boxes of a screen. */
export const deviceBoxes = (id) => SCREENS[id].boxes.filter((b) => DEVICE_MODULES.has(b.module));

/** Placeholder for a server module when the Kindle has no downloaded screen (the date tile says why). */
function placeholder(box, module) {
  return text(0, firstBaseline(TILE_TYPE.label.size), box.person ?? LABELS[module], { ...TILE_TYPE.label, ink: box.tone === "dark" ? "#aaaaaa" : TILE_INK.muted });
}

/** A tile: its background, then `inner` (module coordinates) placed in its content box. */
export function boxSvg(b, inner) {
  return tile(b.tile, b.tone ?? "outline") + `<g transform="translate(${b.x} ${b.y}) scale(${GRID.scale})">${inner}</g>`;
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
