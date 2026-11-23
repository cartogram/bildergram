#!/usr/bin/env node
// ============================================================
// kindle/build.mjs — builds the on-device Tempelhof dashboard
// for a jailbroken Kindle Paperwhite 3 (`npm run kindle:build`).
//
// Everything the Kindle needs is computed here, so the device
// never needs Wi-Fi: the open/close schedule for the next few
// years (from src/data/templehof.ts), one full-screen background
// per state, and one countdown image per minute value. The
// device script (kindle/device/tempelhof.sh) just looks up the
// next event and pastes images with `eips`.
//
// Output: kindle/dist/
//   tempelhof/   → copied to /mnt/us/tempelhof on the Kindle
//   documents/   → scriptlets, copied to /mnt/us/documents
//   preview/     → composited frames to review in a browser
// ============================================================

import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { HOURS, getCloseTime, getTemplehofStatus, formatCountdown } from "../src/data/templehof.ts";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const OUT = `${REPO}/kindle/dist`;

// ------------------------------------------------------------------
// Panel: Paperwhite 3 framebuffer is 1072×1448 portrait, 8-bit gray
// (`eips -i`). We lay out in landscape and rotate before writing,
// because `eips -g` pastes pixels as-is. ROTATE picks which way the
// landscape image is turned; build with KINDLE_ROTATE=cw if the
// dashboard shows upside down on the mounted Kindle.
// ------------------------------------------------------------------
const ROTATE = process.env.KINDLE_ROTATE ?? "ccw";
const W = 1448; // landscape width
const H = 1072; // landscape height
const YEARS = 3; // schedule length — reinstall before it runs out

// Landscape layout (px at 300 ppi)
const M = 80; // side margin
const COUNTDOWN = { x: M, y: 520, w: W - 2 * M, h: 250 };
const DATE = { x: W - M - 640, y: 80, w: 640, h: 70 };
const BATTERY = { x: W - M - 360, y: 930, w: 360, h: 70 };

// ------------------------------------------------------------------
// Schedule
// ------------------------------------------------------------------

const berlin = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit",
});

function berlinParts(ms) {
  const p = Object.fromEntries(berlin.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

/** UTC epoch ms for a Berlin wall-clock time (opening hours never fall in a DST gap). */
function berlinToUtc(y, m, d, h, mi) {
  const want = Date.UTC(y, m - 1, d, h, mi);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const p = berlinParts(t);
    t += want - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  }
  return t;
}

const hhmm = (s) => s.replace(":", "");

/**
 * Every open/close event from yesterday until YEARS from now. Each
 * event carries the background to show *before* it: while the next
 * event is a closing, the field is open, and vice versa.
 */
function buildSchedule(fromMs) {
  const events = [];
  const first = berlinParts(fromMs - 86_400_000);
  const day0 = Date.UTC(first.y, first.m - 1, first.d);
  for (let i = 0; i < YEARS * 366; i++) {
    const day = new Date(day0 + i * 86_400_000);
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    const entry = HOURS[m - 1];
    const open = entry.open;
    const close = getCloseTime(entry, d);
    const hours = `${hhmm(open)}-${hhmm(close)}`;
    const [oh, om] = open.split(":").map(Number);
    const [ch, cm] = close.split(":").map(Number);
    events.push({ t: berlinToUtc(y, m, d, oh, om), kind: "open", label: open, bg: `closed_${hours}` });
    events.push({ t: berlinToUtc(y, m, d, ch, cm), kind: "close", label: close, bg: `open_${hours}` });
  }
  return events.sort((a, b) => a.t - b.t);
}

function nextEvent(events, ms) {
  let lo = 0, hi = events.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].t > ms) hi = mid; else lo = mid + 1;
  }
  return events[lo].t > ms ? events[lo] : null;
}

/** The device's countdown: minutes to the next event, rounded up. */
const minutesLeft = (ev, ms) => Math.ceil((ev.t - ms) / 60_000);

/**
 * Cross-check the schedule against the existing status logic
 * (getTemplehofStatus, ported from openfeld) every 7 minutes for a
 * year: same open/closed state and same target time.
 */
function verifySchedule(events, fromMs) {
  let checked = 0;
  for (let t = fromMs; t < fromMs + 366 * 86_400_000; t += 7 * 60_000) {
    const ev = nextEvent(events, t);
    const status = getTemplehofStatus(new Date(t));
    const open = ev.kind === "close";
    const target = open ? status.closesAt : status.opensAt;
    if (open !== status.open || ev.label !== target) {
      throw new Error(
        `schedule mismatch at ${new Date(t).toISOString()}: schedule says ${open ? "open" : "closed"} → ${ev.label}, ` +
          `getTemplehofStatus says ${status.open ? "open" : "closed"} → ${target}`,
      );
    }
    checked++;
  }
  return checked;
}

// ------------------------------------------------------------------
// Rendering (resvg in Node) → 8-bit gray, 16 levels, rotated
// ------------------------------------------------------------------

await initWasm(readFileSync(`${REPO}/node_modules/@resvg/resvg-wasm/index_bg.wasm`));
const FONT = readFileSync(`${REPO}/assets/fonts/Arimo.ttf`);

/** Faux bold: resvg can't pick a weight from the variable font, so stroke the outline. */
const bold = (size) => `stroke="#000" stroke-width="${(size * 0.035).toFixed(1)}" stroke-linejoin="round"`;

function rasterize(svg) {
  const img = new Resvg(svg, { font: { fontBuffers: [FONT], loadSystemFonts: false, defaultFontFamily: "Arimo" } }).render();
  const rgba = img.pixels; // a getter that copies out of WASM memory — read it once
  const gray = new Uint8Array(img.width * img.height);
  for (let i = 0; i < gray.length; i++) {
    // Black-on-white art: any channel is the gray value. Quantize to
    // the panel's 16 levels so eips doesn't dither.
    gray[i] = Math.round(rgba[i * 4] / 17) * 17;
  }
  return { w: img.width, h: img.height, px: gray };
}

/** Rotate 90°: "ccw" maps landscape (x, y) → portrait (y, w-1-x). */
function rotate(img) {
  const { w, h, px } = img;
  const out = new Uint8Array(w * h);
  const ccw = ROTATE === "ccw";
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = ccw ? y : h - 1 - y;
      const ny = ccw ? w - 1 - x : x;
      out[ny * h + nx] = px[y * w + x];
    }
  }
  return { w: h, h: w, px: out };
}

/** Where a landscape rect lands in the portrait framebuffer after rotation. */
function rotatedOrigin(r) {
  return ROTATE === "ccw" ? { x: r.y, y: W - r.x - r.w } : { x: H - r.y - r.h, y: r.x };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** 8-bit grayscale PNG, no alpha — what eips expects. */
function encodePng({ w, h, px }) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    Buffer.from(px.buffer, px.byteOffset + y * w, w).copy(raw, y * (w + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------
// Screens
// ------------------------------------------------------------------

const svgOpen = (w, h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fff"/>`;

/** Full-screen background for one state; the countdown area is left blank. */
function backgroundSvg(key) {
  const [state, hours] = key.split("_");
  const [open, close] = hours.split("-").map((s) => `${s.slice(0, 2)}:${s.slice(2)}`);
  const isOpen = state === "open";
  const target = isOpen ? `closes at ${close}` : `opens at ${open}`;
  const until = isOpen ? "until it closes" : "until it opens";
  return `${svgOpen(W, H)}
    <text x="${M}" y="130" font-size="46" letter-spacing="6" fill="#444">TEMPELHOFER FELD</text>
    <text x="${M}" y="365" font-size="210" ${bold(210)}>${isOpen ? "OPEN" : "CLOSED"}</text>
    <text x="${M}" y="470" font-size="72" fill="#222">${target}</text>
    <text x="${M}" y="850" font-size="60" fill="#444">${until}</text>
    <rect x="${M}" y="905" width="${W - 2 * M}" height="4" fill="#000"/>
    <text x="${M}" y="985" font-size="46" fill="#444">Opening hours ${open} – ${close}</text>
  </svg>`;
}

/** One countdown value, sized to exactly the COUNTDOWN rect so it overwrites the previous one. */
function countdownSvg(minutes) {
  const text = formatCountdown(minutes * 60_000);
  return `${svgOpen(COUNTDOWN.w, COUNTDOWN.h)}
    <text x="0" y="${COUNTDOWN.h - 40}" font-size="230" ${bold(230)}>${text}</text>
  </svg>`;
}

/** Today's date, right-aligned in the header — one image per Berlin day. */
function dateSvg(y, m, d) {
  const text = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-GB", {
    timeZone: "UTC", weekday: "long", day: "numeric", month: "long",
  });
  return `${svgOpen(DATE.w, DATE.h)}
    <text x="${DATE.w}" y="${DATE.h - 20}" font-size="46" text-anchor="end" fill="#222">${text}</text>
  </svg>`;
}

const dateKey = (p) => `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;

function batterySvg() {
  return `${svgOpen(BATTERY.w, BATTERY.h)}
    <text x="${BATTERY.w}" y="${BATTERY.h - 18}" font-size="46" text-anchor="end" ${bold(46)}>Battery low</text>
  </svg>`;
}

// ------------------------------------------------------------------
// Build
// ------------------------------------------------------------------

const t0 = performance.now();
const now = Date.now();
const events = buildSchedule(now);
const checked = verifySchedule(events, now);

rmSync(OUT, { recursive: true, force: true });
for (const dir of ["tempelhof/bin", "tempelhof/img/bg", "tempelhof/img/cd", "tempelhof/img/date", "documents", "preview"]) {
  mkdirSync(`${OUT}/${dir}`, { recursive: true });
}

// Schedule: "<epoch-seconds> <open|close> <background-key>"
writeFileSync(
  `${OUT}/tempelhof/schedule.txt`,
  events.map((e) => `${Math.round(e.t / 1000)} ${e.kind} ${e.bg}`).join("\n") + "\n",
);

// Backgrounds
const bgs = new Map();
for (const key of new Set(events.map((e) => e.bg))) {
  const img = rotate(rasterize(backgroundSvg(key)));
  bgs.set(key, img);
  writeFileSync(`${OUT}/tempelhof/img/bg/${key}.png`, encodePng(img));
}

// Countdown images: 1 … longest gap between events, in minutes
let maxMinutes = 0;
for (let i = 1; i < events.length; i++) {
  maxMinutes = Math.max(maxMinutes, Math.ceil((events[i].t - events[i - 1].t) / 60_000));
}
const cds = new Map();
for (let m = 0; m <= maxMinutes; m++) {
  const img = rotate(rasterize(countdownSvg(m)));
  cds.set(m, img);
  writeFileSync(`${OUT}/tempelhof/img/cd/${m}.png`, encodePng(img));
}
const battery = rotate(rasterize(batterySvg()));
writeFileSync(`${OUT}/tempelhof/img/battery-low.png`, encodePng(battery));

// Date images: every Berlin day the schedule covers (img/date/YYYY-MM-DD.png)
const dates = new Map();
for (const key of new Set(events.map((e) => dateKey(berlinParts(e.t))))) {
  const [y, m, d] = key.split("-").map(Number);
  const img = rotate(rasterize(dateSvg(y, m, d)));
  dates.set(key, img);
  writeFileSync(`${OUT}/tempelhof/img/date/${key}.png`, encodePng(img));
}

// Paste positions for eips (portrait framebuffer coordinates)
const cd = rotatedOrigin(COUNTDOWN);
const dt = rotatedOrigin(DATE);
const bat = rotatedOrigin(BATTERY);
writeFileSync(
  `${OUT}/tempelhof/layout.env`,
  `# Generated by kindle/build.mjs (rotation: ${ROTATE}) — eips paste positions\n` +
    `CD_X=${cd.x}\nCD_Y=${cd.y}\nDATE_X=${dt.x}\nDATE_Y=${dt.y}\nBAT_X=${bat.x}\nBAT_Y=${bat.y}\n`,
);

// Device script + scriptlets
copyFileSync(`${REPO}/kindle/device/tempelhof.sh`, `${OUT}/tempelhof/bin/tempelhof.sh`);
for (const name of ["Tempelhof.sh", "Tempelhof test.sh", "Tempelhof log.sh"]) {
  copyFileSync(`${REPO}/kindle/scriptlets/${name}`, `${OUT}/documents/${name}`);
}

// ------------------------------------------------------------------
// Preview: composite frames exactly as the device would (paste the
// rotated images at the eips offsets), then rotate back to landscape.
// ------------------------------------------------------------------

function paste(dst, src, at) {
  for (let y = 0; y < src.h; y++) {
    dst.px.set(src.px.subarray(y * src.w, (y + 1) * src.w), (at.y + y) * dst.w + at.x);
  }
}
function unrotate(img) {
  const { w, h, px } = img; // portrait
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // inverse of rotate(): portrait (x, y) → landscape
      const [lx, ly] = ROTATE === "ccw" ? [h - 1 - y, x] : [y, w - 1 - x];
      out[ly * h + lx] = px[y * w + x];
    }
  }
  return { w: h, h: w, px: out };
}

const today = berlinParts(now);
const todaysEvent = (kind) =>
  events.find((e) => {
    const p = berlinParts(e.t);
    return e.kind === kind && p.y === today.y && p.m === today.m && p.d === today.d;
  });
const samples = [
  ["Now", now],
  ["10 min before opening", todaysEvent("open").t - 10 * 60_000],
  ["Afternoon", berlinToUtc(today.y, today.m, today.d, 14, 5)],
  ["1 min before closing", todaysEvent("close").t - 60_000],
  ["Mid-June 12:00", berlinToUtc(today.y + 1, 6, 15, 12, 0)],
  ["Low battery", now],
];
const previews = samples.map(([label, ms], i) => {
  const ev = nextEvent(events, ms);
  const mins = minutesLeft(ev, ms);
  const frame = { w: H, h: W, px: new Uint8Array(bgs.get(ev.bg).px) };
  paste(frame, cds.get(mins), cd);
  paste(frame, dates.get(dateKey(berlinParts(ms))), dt);
  if (label === "Low battery") paste(frame, battery, bat);
  const file = `frame-${i}.png`;
  writeFileSync(`${OUT}/preview/${file}`, encodePng(unrotate(frame)));
  const when = new Date(ms).toLocaleString("en-GB", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" });
  return { label, when, file, bg: ev.bg, mins };
});
writeFileSync(
  `${OUT}/preview/index.html`,
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tempelhof Preview</title>
<style>
  :root { --bg: #e9e7e3; --ink: #1b1a18; --muted: #6a675f; --card: #fff; --line: #d4d1ca; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #1b1b1d; --ink: #ecebe8; --muted: #a09d97; --card: #26262a; --line: #3a3a3f; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; }
  main { max-width: 1500px; margin: 0 auto; padding: 24px 16px; }
  h1 { font-size: 22px; margin: 0 0 4px; } p { color: var(--muted); margin: 0 0 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 640px), 1fr)); gap: 18px; }
  figure { margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
  figcaption { font-size: 13px; margin-bottom: 8px; display: flex; justify-content: space-between; gap: 8px; }
  figcaption span { color: var(--muted); }
  img { display: block; width: 100%; height: auto; border: 1px solid var(--line); background: #fff; }
</style>
<main>
  <h1>Tempelhof dashboard — Kindle Paperwhite 3 preview</h1>
  <p>Composited from the exact files the Kindle will paste (rotation: ${ROTATE}), rotated back to landscape. 1448 × 1072, 16 gray levels.</p>
  <div class="grid">
  ${previews.map((p) => `<figure><figcaption><b>${p.label}</b><span>${p.when} · bg ${p.bg} · ${p.mins} min</span></figcaption><img src="${p.file}" alt="${p.label}"></figure>`).join("\n  ")}
  </div>
</main>`,
);

console.log(
  `kindle/dist: ${events.length} events (${YEARS}y, verified at ${checked} instants), ` +
    `${bgs.size} backgrounds, ${cds.size} countdown images (max ${formatCountdown(maxMinutes * 60_000)}), ` +
    `${dates.size} date images, ` +
    `rotation ${ROTATE}, countdown at eips -x ${cd.x} -y ${cd.y} — ${((performance.now() - t0) / 1000).toFixed(1)}s`,
);
