// ============================================================
// kindle/lib/design.mjs — design system for the Kindle screens
// (Phase 8). Every screen and module draws with these tokens and
// primitives, so type, spacing, ink and German wording stay
// consistent across screens.
//
// Canvas: 1448 × 1072 landscape at 300 ppi (Paperwhite 3), drawn as
// SVG and quantized to the panel's 16 gray levels by eink.mjs.
// ============================================================

import { H, W, escapeXml, textWidth, boldTextWidth, regularTextWidth } from "./eink.mjs";

// ------------------------------------------------------------------
// Tokens
// ------------------------------------------------------------------

export const CANVAS = { w: W, h: H };

/** Spacing unit; layouts use multiples of it. */
export const U = 8;

export const MARGIN = { x: 72, top: 64, bottom: 56 };

/** Three inks, each exactly one of the panel's 16 levels (multiples of 17). */
export const INK = {
  primary: "#000000",
  secondary: "#333333",
  tertiary: "#666666",
  /** Light fill behind dark text, e.g. progress bars (204 = 12 × 17, a panel level). */
  fill: "#cccccc",
  paper: "#ffffff",
};

/** Type scale (px at 300 ppi). `caps` styles are letter-spaced capitals. */
export const TYPE = {
  display: { size: 123, weight: "bold", underline: true },
  label: { size: 40, weight: "bold", underline: true },
  strong: { size: 40, weight: "bold" },
  body: { size: 40 },
  caption: { size: 26, weight: "bold", ink: INK.secondary },
};

export const RULE = { hair: 3, thick: 6 };

/** Top bar: date left, battery right, a rule below; content starts at CONTENT.top. */
export const TOPBAR = { baseline: 104, rule: 132 };
export const CONTENT = { top: 172, bottom: H - MARGIN.bottom, left: MARGIN.x, right: W - MARGIN.x };

/**
 * Tile grid (Phase 14): 8 × 4 cells of 171 × 256, 8 apart and 12 from
 * the edges (12 + 8·171 + 7·8 + 12 = 1448; 12 + 4·256 + 3·8 + 12 = 1072). cell(col, row, cols, rows) is a tile's rect;
 * its content sits TILE_PAD inside.
 */
export const GRID = { col: 171, row: 256, gap: 8, margin: 12, radius: 32 };
export const TILE_PAD = 24;
export const cell = (col, row, cols = 1, rows = 1) => ({
  x: GRID.margin + col * (GRID.col + GRID.gap),
  y: GRID.margin + row * (GRID.row + GRID.gap),
  w: cols * GRID.col + (cols - 1) * GRID.gap,
  h: rows * GRID.row + (rows - 1) * GRID.gap,
});

/** Inks on a dark tile (all panel levels). */
export const INK_DARK = { primary: INK.paper, secondary: "#cccccc", tertiary: "#999999" };

/**
 * Proposed tile type scale (Phase 14, not yet applied to the modules):
 * five sizes, bold for titles and figures. See `npm run kindle:design`.
 */
/**
 * Tile spacing (Phase 14): a tile's first line puts its capitals FIRST_CAP
 * below the content box's top (baseline = FIRST_CAP + 0.716 × size, Arimo's
 * cap height); its last line sits on the content box's bottom edge.
 */
export const FIRST_CAP = 8;
export const firstBaseline = (size) => FIRST_CAP + Math.round(size * 0.716);

export const TILE_TYPE = {
  /** The one big figure on a tile: the temperature, the day of the month. */
  display: { size: 104, weight: "bold" },
  /** The body size in bold: the Ausdruck, the month. */
  heading: { size: 32, weight: "bold" },
  /** Sentences, list rows, values. */
  body: { size: 32 },
  /** A tile's title and field labels ("Im Kino", "Niederschlag", "Matt", the weekday). */
  label: { size: 28, weight: "bold" },
  /** Secondary lines, legends, pills, the Feld line. */
  small: { size: 24 },
};

/**
 * Proposed tile inks (Phase 14): four panel levels (multiples of 17) on
 * paper, and their counterparts on a dark tile.
 */
export const TILE_INK = {
  /** Text and figures; the time still to go; today's ring. */
  ink: "#000000",
  /** Secondary text (meanings, values); the week ring. */
  muted: "#555555",
  /** Tertiary text (lows, plurals); the year ring. */
  faint: "#888888",
  /** Tracks and time gone by. */
  line: "#cccccc",
  paper: "#ffffff",
};
export const TILE_INK_DARK = { ink: "#ffffff", muted: "#aaaaaa", faint: "#777777", line: "#444444", paper: "#000000" };

/**
 * A pill: short bold text, light on a dark rounded bar (Phase 14: the
 * Feld's times, the cinemas, the battery). The text's baseline is at y;
 * `right` puts the pill's right edge at x. `fill`/`ink` invert it on a
 * dark tile. Returns { svg, x, y, w, h } (the pill's rect).
 */
export const PILL = { size: 24, h: 32, padX: 10, above: 23 };
export function pill(x, y, str, { right = false, fill = INK.primary, ink = INK.paper, size = PILL.size } = {}) {
  const k = size / PILL.size;
  const h = Math.round(PILL.h * k);
  const padX = Math.round(PILL.padX * k);
  const style = { size, weight: "bold", ink };
  const w = Math.ceil(exactWidth(str, style)) + 2 * padX;
  const left = right ? x - w : x;
  const top = y - Math.round(PILL.above * k);
  const svg = `<rect x="${left}" y="${top}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"/>` + text(left + padX, y, str, style);
  return { svg, x: left, y: top, w, h };
}

/**
 * A circle label: a letter (a cinema), light on a dark circle as tall as a
 * pill (PILL.h) and in the pills' text size, centred at (cx, cy). Two
 * letters shrink to fit.
 */
export const CIRCLE_LABEL = { d: PILL.h, size: PILL.size };
export function circleLabel(cx, cy, str, { fill = INK.primary, ink = INK.paper } = {}) {
  const { d } = CIRCLE_LABEL;
  const size = fitSize(str, { size: CIRCLE_LABEL.size, weight: "bold" }, d - 8, 12);
  return `<circle cx="${cx}" cy="${cy}" r="${d / 2}" fill="${fill}"/>` +
    text(cx, cy + Math.round(size * 0.36), str, { size, weight: "bold", ink }, { anchor: "middle" });
}

/**
 * A stat row (Phase 14): the label left in the label style, the value
 * right-aligned at STAT.value (28 bold — values are bold). `parts` are [str, ink] pairs read
 * left to right, e.g. [["40", ink], ["/ 30", faint]]. Used by the
 * weather's details and days and the exercise legend, so they read alike.
 */
export const STAT = { value: { size: 28, weight: "bold" }, lead: 38 };
export function statRow(x, y, w, label, parts, { labelX = x, labelInk = TILE_INK.ink } = {}) {
  let svg = text(labelX, y, label, { ...TILE_TYPE.label, ink: labelInk });
  let right = x + w;
  for (const [str, ink] of [...parts].reverse()) {
    svg += text(right, y, str, { ...STAT.value, ink }, { anchor: "end" });
    right -= Math.ceil(exactWidth(str, STAT.value)) + 10;
  }
  return svg;
}

/**
 * A tile's rounded rect: "outline" (a border), "light" (a light gray
 * border), "fill" (light gray), "dark"
 * (black) or "bleed" (no container: nothing drawn; the module's graphics
 * may reach into the padding, its text keeps the inset — screens.mjs T()).
 */
export function tile(r, style = "outline") {
  if (style === "bleed") return "";
  if (style === "light") {
    // An outline in the line ink.
    const t = RULE.hair;
    return `<rect x="${r.x + t / 2}" y="${r.y + t / 2}" width="${r.w - t}" height="${r.h - t}" rx="${GRID.radius - t / 2}" fill="none" stroke="${TILE_INK.line}" stroke-width="${t}"/>`;
  }
  const a = `x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${GRID.radius}"`;
  if (style === "outline") {
    const t = RULE.hair;
    return `<rect x="${r.x + t / 2}" y="${r.y + t / 2}" width="${r.w - t}" height="${r.h - t}" rx="${GRID.radius - t / 2}" fill="none" stroke="${INK.primary}" stroke-width="${t}"/>`;
  }
  return `<rect ${a} fill="${style === "dark" ? INK.primary : "#eeeeee"}"/>`;
}

// ------------------------------------------------------------------
// Text
// ------------------------------------------------------------------

const BOLD_WIDTH = 1.07; // Arimo Bold is ≤ 7% wider than Regular

/** Rendered width of `str` in a type style (approximate, never under). */
export function width(str, style) {
  const s = style.caps ? str.toUpperCase() : str;
  const w = textWidth(s, style.size) * (style.weight === "bold" ? BOLD_WIDTH : 1);
  return w + (style.spacing ?? 0) * Math.max(0, [...s].length - 1);
}

/** An SVG <text> in a type style; `opts` may override ink, anchor or size. */
export function text(x, y, str, style, opts = {}) {
  const size = opts.size ?? style.size;
  const s = style.caps || opts.caps ? str.toUpperCase() : str;
  const attrs = [
    `x="${round(x)}"`,
    `y="${round(y)}"`,
    `font-size="${size}"`,
    style.weight === "bold" || opts.weight === "bold" ? `font-weight="bold"` : "",
    `fill="${opts.ink ?? style.ink ?? INK.primary}"`,
    style.spacing ? `letter-spacing="${style.spacing}"` : "",
    opts.anchor ? `text-anchor="${opts.anchor}"` : "",
  ].filter(Boolean);
  let svg = `<text ${attrs.join(" ")}>${escapeXml(s)}</text>`;
  // Underlined styles (display, label): a rule exactly as long as the text.
  if (style.underline) {
    const w = exactWidth(s.trimEnd(), { ...style, size });
    const left = opts.anchor === "end" ? x - w : opts.anchor === "middle" ? x - w / 2 : x;
    const t = Math.max(RULE.hair, Math.round(size / 20));
    svg += `<rect x="${round(left)}" y="${round(y + size * 0.2)}" width="${round(w)}" height="${t}" fill="${opts.ink ?? style.ink ?? INK.primary}"/>`;
  }
  return svg;
}

/**
 * Exact pen width of `str` in a type style (bold from Arimo Bold's own
 * advances), for drawing that must end with the text, e.g. an underline.
 * Layout and wrapping keep using width(), which never under-measures.
 */
export function exactWidth(str, style) {
  const s = style.caps ? str.toUpperCase() : str;
  const w = style.weight === "bold" ? boldTextWidth(s, style.size) : regularTextWidth(s, style.size);
  return w + (style.spacing ?? 0) * Math.max(0, [...s].length - 1);
}

/** Largest size ≤ style.size (in 2 px steps) at which `str` fits `maxWidth`. */
export function fitSize(str, style, maxWidth, min = 24) {
  let size = style.size;
  while (size > min && width(str, { ...style, size }) > maxWidth) size -= 2;
  return size;
}

// ------------------------------------------------------------------
// Primitives
// ------------------------------------------------------------------

const round = (n) => Math.round(n * 10) / 10;

export function hrule(x, y, w, weight = RULE.hair, ink = INK.primary) {
  return `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${weight}" fill="${ink}"/>`;
}

export function vrule(x, y, h, weight = RULE.hair, ink = INK.primary) {
  return `<rect x="${round(x)}" y="${round(y)}" width="${weight}" height="${round(h)}" fill="${ink}"/>`;
}

/**
 * Section titles (WETTER, TEMPELHOFER FELD, …) are off: the screens read
 * without them. Modules still lay out below a title line; screens.mjs and
 * the build render each module TITLE_SPACE taller and shifted up by it, so
 * the top content takes the title's place and bottom-anchored lines stay.
 */
export const SECTION_TITLES = false;
export const TITLE_SPACE = SECTION_TITLES ? 0 : 64;

/** A module's section title, or nothing while SECTION_TITLES is off. */
export function sectionTitle(str) {
  return SECTION_TITLES ? label(0, 30, str) : "";
}

/** Module label: small letter-spaced capitals, e.g. "WETTER". Baseline at y. */
export function label(x, y, str) {
  return text(x, y, str, TYPE.label);
}

/**
 * A timestamp ("Stand 19:00"): a caption in a thin outlined box, the same
 * everywhere. (x, baseline y) is where a plain caption would sit; `anchor`
 * "end" right-aligns the box at x; `scale` shrinks it. Returns { svg, w }.
 */
export function stamp(x, y, str, { anchor, scale = 1 } = {}) {
  const style = { ...TYPE.caption, size: Math.round(TYPE.caption.size * scale) };
  const padX = Math.round(12 * scale);
  const w = Math.round(exactWidth(str, style)) + 2 * padX;
  const h = Math.round(style.size * 1.6);
  const left = anchor === "end" ? x - w : x;
  const top = y - Math.round(style.size * 1.1);
  const svg =
    `<rect x="${left + RULE.hair / 2}" y="${top + RULE.hair / 2}" width="${w - RULE.hair}" height="${h - RULE.hair}" rx="${Math.round(6 * scale)}" fill="none" stroke="${style.ink}" stroke-width="${RULE.hair}"/>` +
    text(left + padX, y, str, style);
  return { svg, w };
}

/** Top bar shared by framed screens: the German date (label) left; battery and Stand right, on its line. */
export function topbar({ date, battery, updated }) {
  let svg = "";
  if (date) svg += text(MARGIN.x, TOPBAR.baseline, deDateLong(date), TYPE.label);
  // Right-aligned across from the date: the battery, then when the data was fetched.
  let right = W - MARGIN.x;
  if (updated) {
    const st = stamp(right, TOPBAR.baseline, `Stand ${updated}`, { anchor: "end" });
    svg += st.svg;
    right -= st.w + 20;
  }
  if (battery != null) svg += text(right, TOPBAR.baseline, `Akku ${battery} %`, TYPE.caption, { anchor: "end" });
  return svg;
}

// ------------------------------------------------------------------
// German formatting
// ------------------------------------------------------------------

const utcNoon = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};

/** "Montag, 23. November" for "2026-11-23". */
export function deDateLong(date) {
  return utcNoon(date).toLocaleDateString("de-DE", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
}

/** "Mo", "Di", … for a date. */
export function deWeekdayShort(date) {
  return utcNoon(date).toLocaleDateString("de-DE", { timeZone: "UTC", weekday: "short" }).replace(".", "");
}

/** Decimal comma and a typographic minus: 1.2 → "1,2", -3 → "−3". */
export function deNumber(n, digits = 0) {
  return Number(n)
    .toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    .replace("-", "−");
}

/** Countdown: 135 → "2h 15min", 45 → "45min". */
export function deCountdown(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

/** "HH:MM" Berlin wall time of an ISO timestamp. */
export function deTime(iso) {
  return new Date(iso).toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
}

// ------------------------------------------------------------------
// Weather icons — strokes only, scaled from a 100 × 100 design grid
// ------------------------------------------------------------------

const CLOUD = "M24 76 H74 A17 17 0 0 0 76 42 A26 26 0 0 0 27 36 A20 20 0 0 0 24 76 Z";

function sun(cx, cy, r, rays) {
  let s = `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x1 = cx + Math.cos(a) * (r + rays * 0.35);
    const y1 = cy + Math.sin(a) * (r + rays * 0.35);
    const x2 = cx + Math.cos(a) * (r + rays);
    const y2 = cy + Math.sin(a) * (r + rays);
    s += `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}"/>`;
  }
  return s;
}

/** Icon kind for a WMO weather code (Open-Meteo). */
export function iconKind(code) {
  if (code === 0) return "sun";
  if (code === 1 || code === 2) return "partly";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloud";
}

/**
 * Small line icons for weather details ("wind", "sunset"), drawn like the
 * weather icons on the 100-unit grid with a heavier stroke so they hold up
 * at text size. `size` px square, top-left at (x, y).
 */
export function detailIcon(kind, x, y, size) {
  const k = size / 100;
  const stroke = `fill="none" stroke="${INK.primary}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"`;
  const body = {
    wind:
      `<path d="M8 36 H60 A13 13 0 1 0 47 23"/>` +
      `<path d="M8 56 H76 A13 13 0 1 1 63 69"/>` +
      `<path d="M8 76 H44"/>`,
    sunset:
      `<path d="M6 66 H94"/>` +
      `<path d="M26 66 A24 24 0 0 1 74 66"/>` +
      `<path d="M50 20 V30 M18 34 L25 41 M82 34 L75 41"/>` +
      `<path d="M50 78 V96 M41 88 L50 96 L59 88"/>`,
  }[kind];
  return `<g transform="translate(${round(x)} ${round(y)}) scale(${round(k * 1000) / 1000})" ${stroke}>${body}</g>`;
}

/** Weather icon for a WMO code, `size` px square with its top-left at (x, y). */
export function weatherIcon(code, x, y, size) {
  const kind = iconKind(code);
  const k = size / 100;
  // Stroke 6 on the 100-unit grid, so it scales with the icon.
  const stroke = `fill="none" stroke="${INK.primary}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"`;
  let body = "";
  const cloud = (dy = 0) => `<path d="${CLOUD}" transform="translate(0 ${dy})" fill="${INK.paper}"/>`;
  switch (kind) {
    case "sun":
      body = sun(50, 50, 18, 30);
      break;
    case "partly":
      body = sun(38, 36, 13, 22) + cloud(10);
      break;
    case "cloud":
      body = cloud(0);
      break;
    case "fog":
      body = [30, 45, 60, 75].map((yy, i) => `<line x1="${14 + (i % 2) * 8}" y1="${yy}" x2="${86 - ((i + 1) % 2) * 8}" y2="${yy}"/>`).join("");
      break;
    case "drizzle":
      body = cloud(-12) + [32, 50, 68].map((xx) => `<circle cx="${xx}" cy="86" r="2.5" fill="${INK.primary}"/>`).join("");
      break;
    case "rain":
      body = cloud(-12) + [34, 52, 70].map((xx) => `<line x1="${xx}" y1="78" x2="${xx - 6}" y2="94"/>`).join("");
      break;
    case "snow":
      // Six-armed flakes with thinner strokes, so they read as flakes, not blobs.
      body = cloud(-12) + [30, 50, 70].map((xx) =>
        `<g transform="translate(${xx} 87)" stroke-width="3.5"><line x1="-8" y1="0" x2="8" y2="0"/><line x1="-4" y1="-7" x2="4" y2="7"/><line x1="-4" y1="7" x2="4" y2="-7"/></g>`,
      ).join("");
      break;
    case "storm":
      body = cloud(-12) + `<path d="M54 66 L44 82 H56 L46 98"/>`;
      break;
  }
  return `<g transform="translate(${round(x)} ${round(y)}) scale(${round(k * 1000) / 1000})" ${stroke}>${body}</g>`;
}

/** German description for a WMO weather code. */
export function weatherText(code) {
  const t = {
    0: "Klar", 1: "Überwiegend klar", 2: "Teilweise bewölkt", 3: "Bedeckt",
    45: "Nebel", 48: "Nebel mit Reif",
    51: "Leichter Nieselregen", 53: "Nieselregen", 55: "Starker Nieselregen",
    56: "Gefrierender Nieselregen", 57: "Gefrierender Nieselregen",
    61: "Leichter Regen", 63: "Regen", 65: "Starker Regen",
    66: "Gefrierender Regen", 67: "Gefrierender Regen",
    71: "Leichter Schneefall", 73: "Schneefall", 75: "Starker Schneefall", 77: "Schneegriesel",
    80: "Leichte Regenschauer", 81: "Regenschauer", 82: "Starke Regenschauer",
    85: "Schneeschauer", 86: "Starke Schneeschauer",
    95: "Gewitter", 96: "Gewitter mit Hagel", 99: "Gewitter mit Hagel",
  };
  return t[code] ?? "Wechselhaft";
}
