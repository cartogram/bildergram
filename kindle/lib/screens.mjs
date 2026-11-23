// ============================================================
// kindle/lib/screens.mjs — the screens (Phase 8)
// Each screen is a hand-designed layout: an optional top bar
// (date, battery) and boxes, each filled by a module. Boxes don't
// overlap, so on the Kindle each can be pasted on its own cadence.
// ============================================================

import { CONTENT, INK, RULE, TYPE, hrule, label, text, topbar, vrule } from "./design.mjs";
import { svgOpen, W, H } from "./eink.mjs";
import * as ausdruck from "./modules/ausdruck.mjs";
import * as kino from "./modules/kino.mjs";
import * as tempelhof from "./modules/tempelhof.mjs";
import * as wetter from "./modules/wetter.mjs";

export const MODULES = { ausdruck, kino, tempelhof, wetter };

const contentW = CONTENT.right - CONTENT.left;
const contentH = CONTENT.bottom - CONTENT.top;

const TAG_LEFT_W = 780;
const TAG_GAP = 32;

/** name (German, shown on the admin page), top bar flags, boxes and rules. */
export const SCREENS = {
  morgen: {
    name: "Morgen",
    frame: { date: true, battery: true },
    boxes: [
      { module: "wetter", variant: "wide", x: CONTENT.left, y: CONTENT.top, w: contentW, h: 470 },
      { module: "ausdruck", variant: "wide", x: CONTENT.left, y: CONTENT.top + 530, w: contentW, h: contentH - 530 },
    ],
    rules: [{ h: true, x: CONTENT.left, y: CONTENT.top + 494, len: contentW }],
  },
  tag: {
    name: "Tag",
    frame: { date: true, battery: true },
    boxes: [
      { module: "tempelhof", variant: "half", x: CONTENT.left, y: CONTENT.top, w: TAG_LEFT_W, h: contentH },
      {
        module: "wetter", variant: "compact",
        x: CONTENT.left + TAG_LEFT_W + 2 * TAG_GAP + RULE.hair, y: CONTENT.top,
        w: contentW - TAG_LEFT_W - 2 * TAG_GAP - RULE.hair, h: contentH,
      },
    ],
    rules: [{ v: true, x: CONTENT.left + TAG_LEFT_W + TAG_GAP, y: CONTENT.top, len: contentH }],
  },
  abend: {
    name: "Abend",
    frame: { date: true, battery: true },
    boxes: [{ module: "kino", variant: "full", x: CONTENT.left, y: CONTENT.top, w: contentW, h: contentH }],
    rules: [],
  },
  nacht: {
    name: "Nacht",
    frame: { date: true, battery: false },
    boxes: [{ module: "ausdruck", variant: "full", x: CONTENT.left, y: CONTENT.top + 24, w: contentW, h: contentH - 24 }],
    rules: [],
  },
};

/** Modules the Kindle draws itself (prebuilt, updated every minute); the rest come from the server. */
export const DEVICE_MODULES = new Set(["tempelhof"]);

const LABELS = { wetter: "Wetter", kino: "Im Kino", ausdruck: "Ausdruck des Tages", tempelhof: "Tempelhofer Feld" };

/** Screens whose content goes stale within the hour (weather) — the Kindle checks in on the interval. */
export const HOURLY_SCREENS = Object.keys(SCREENS).filter((id) => SCREENS[id].boxes.some((b) => b.module === "wetter"));

/** The Kindle-drawn boxes of a screen. */
export const deviceBoxes = (id) => SCREENS[id].boxes.filter((b) => DEVICE_MODULES.has(b.module));

/** Placeholder for a server module when the Kindle has no downloaded screen. */
function placeholder(box, module) {
  return (
    label(0, 30, LABELS[module]) +
    text(0, Math.min(200, box.h / 2), "Keine Verbindung", TYPE.title, { ink: INK.secondary }) +
    text(0, Math.min(200, box.h / 2) + 56, "Power-Taste drücken, um zu aktualisieren", TYPE.body, { ink: INK.tertiary })
  );
}

/**
 * Render a screen to SVG. `data` supplies each module's input:
 * { date, battery, tempelhof: state, wetter: weather, kino: { programme, from, updated },
 *   ausdruck: entry, updated: { wetter: "HH:MM" } }
 *
 * mode "full"     — everything (gallery, admin preview)
 *      "base"     — Kindle-drawn boxes left blank (the server's image for the Kindle)
 *      "fallback" — no data: server boxes show "Keine Verbindung", Kindle boxes blank (prebuilt)
 */
export function screenSvg(id, data, mode = "full") {
  const s = SCREENS[id];
  let svg = svgOpen(W, H);
  if (s.frame) {
    const live = mode !== "fallback";
    svg += topbar({ date: s.frame.date && live ? data.date : null, battery: s.frame.battery && live ? data.battery : null });
  }
  for (const r of s.rules) svg += r.v ? vrule(r.x, r.y, r.len) : hrule(r.x, r.y, r.len);
  for (const b of s.boxes) {
    const box = { w: b.w, h: b.h, variant: b.variant };
    const onDevice = DEVICE_MODULES.has(b.module);
    let inner = "";
    if (onDevice && mode !== "full") inner = "";
    else if (!onDevice && mode === "fallback") inner = placeholder(box, b.module);
    else if (b.module === "tempelhof") inner = tempelhof.render(box, data.tempelhof);
    else if (b.module === "wetter") inner = wetter.render(box, data.wetter, { updated: data.updated?.wetter });
    else if (b.module === "ausdruck") inner = ausdruck.render(box, data.ausdruck);
    else if (b.module === "kino") {
      inner = kino.render(box, data.kino.programme, {
        date: data.date, from: data.kino.from, updated: data.kino.updated, titleSize: s.frame ? undefined : 40,
      });
    }
    svg += `<g transform="translate(${b.x} ${b.y})">${inner}</g>`;
  }
  return svg + "</svg>";
}
