// ============================================================
// kindle/lib/design.mjs — design system for the Kindle screens
// (Phase 8). Every screen and module draws with these tokens and
// primitives, so type, spacing, ink and German wording stay
// consistent across screens.
//
// Canvas: 1448 × 1072 landscape at 300 ppi (Paperwhite 3), drawn as
// SVG and quantized to the panel's 16 gray levels by eink.mjs.
// ============================================================

import { H, W, escapeXml, textWidth } from "./eink.mjs";

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
  paper: "#ffffff",
};

/** Type scale (px at 300 ppi). `caps` styles are letter-spaced capitals. */
export const TYPE = {
  hero: { size: 200, weight: "bold" },
  display: { size: 132, weight: "bold" },
  headline: { size: 64, weight: "bold" },
  title: { size: 48 },
  body: { size: 40 },
  label: { size: 30, weight: "bold", spacing: 5, ink: INK.secondary },
  caption: { size: 28, ink: INK.tertiary },
};

export const RULE = { hair: 3, thick: 6 };

/** Top bar: date left, battery right, a rule below; content starts at CONTENT.top. */
export const TOPBAR = { baseline: 104, rule: 132 };
export const CONTENT = { top: 172, bottom: H - MARGIN.bottom, left: MARGIN.x, right: W - MARGIN.x };

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
  return `<text ${attrs.join(" ")}>${escapeXml(s)}</text>`;
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

/** Module label: small letter-spaced capitals, e.g. "WETTER". Baseline at y. */
export function label(x, y, str) {
  return text(x, y, str.toUpperCase(), TYPE.label);
}

/** Inverted pill (white on black) for states like GEÖFFNET; returns { svg, w, h }. */
export function pill(x, y, str, size = 44) {
  const style = { size, weight: "bold", spacing: 4 };
  const padX = Math.round(size * 0.55);
  const h = Math.round(size * 1.55);
  const w = Math.round(width(str, style) + 2 * padX);
  const svg =
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.round(h / 2)}" fill="${INK.primary}"/>` +
    text(x + padX, y + Math.round(h * 0.68), str, style, { ink: INK.paper });
  return { svg, w, h };
}

/** Top bar shared by framed screens: German date left, battery right, rule below. */
export function topbar({ date, battery }) {
  let svg = "";
  if (date) svg += text(MARGIN.x, TOPBAR.baseline, deDateLong(date), { size: 36, weight: "bold" });
  if (battery != null) {
    svg += text(W - MARGIN.x, TOPBAR.baseline, `Akku ${battery} %`, { size: 30, ink: INK.tertiary }, { anchor: "end" });
  }
  return svg + hrule(MARGIN.x, TOPBAR.rule, W - 2 * MARGIN.x);
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

/** Countdown: 135 → "2 h 15 min", 45 → "45 min". */
export function deCountdown(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
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
