#!/usr/bin/env node
// ============================================================
// kindle/build.mjs — builds the Kindle bundle (Phase 9)
// (`npm run kindle:build`).
//
// The server renders each screen's "base" (top bar, weather, cinema,
// phrase) at check-in; the Kindle only draws what changes every
// minute: the Tempelhof panel and countdown, pasted into the Tag
// screen's box. This build prepares everything the Kindle draws by
// itself, so it works offline:
//   - the Tempelhof open/close schedule for the next 3 years
//     (kindle/lib/templehof.ts), checked against getTemplehofStatus;
//   - one Tempelhof panel per state and one countdown image per
//     minute value, sized for the box the screens use;
//   - a fallback base per screen ("Keine Verbindung") for when no
//     screen has been downloaded;
//   - the "Aktualisiere …" piece shown during a check-in;
//   - layout.env with the eips paste positions (from screens.mjs).
//
// One bundle per device (kindle/lib/devices.mjs), drawn at its size:
// kindle/dist/<device>/
//   dashboard/   → copied to /mnt/us/dashboard on the Kindle
//   documents/   → scriptlets, copied to /mnt/us/documents
// ============================================================

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { INK, TOPBAR, MARGIN, text } from "./lib/design.mjs";
import { DEVICES, device as getDevice } from "./lib/devices.mjs";
import { W, encodePng, initRenderer, paste, rasterize, rotate, rotatedOrigin, svgOpen } from "./lib/eink.mjs";
import * as tempelhof from "./lib/modules/tempelhof.mjs";
import { buildSchedule, nextEvent } from "./lib/schedule.mjs";
import { HOURLY_SCREENS, SCREENS, deviceBoxes, moduleBox, screenSvg } from "./lib/screens.mjs";
import { TITLE_SPACE } from "./lib/design.mjs";
import { getTemplehofStatus } from "./lib/templehof.ts";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const OUT = `${REPO}/kindle/dist`;
const YEARS = 3; // schedule length — reinstall before it runs out

/** Default screen schedule until the first check-in (HHMM:screen). */
const DEFAULT_SCHEDULE = "0600:morgen 0900:tag 1815:abend 2300:nacht";

/** Where "Aktualisiere …" covers the battery reading in the top bar. */
const UPDATING = { x: W - MARGIN.x - 420, y: TOPBAR.baseline - 44, w: 420, h: 60 };

function version() {
  try {
    return execFileSync("git", ["describe", "--always", "--dirty"], { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
}

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
      throw new Error(`schedule mismatch at ${new Date(t).toISOString()}: ${open ? "open" : "closed"} → ${ev.label} vs ${status.open ? "open" : "closed"} → ${target}`);
    }
    checked++;
  }
  return checked;
}

/** Tempelhof state for a schedule background key such as "open_0700-1800". */
function stateForKey(key, minutes = 0) {
  const [kind, hours] = key.split("_");
  const [o, c] = hours.split("-").map((x) => `${x.slice(0, 2)}:${x.slice(2)}`);
  return { open: kind === "open", target: kind === "open" ? c : o, minutes, hours: [o, c] };
}

/** A full-canvas design SVG holding only `inner` (everything else white). */
const canvasSvg = (inner) => `${svgOpen(W, 1072)}${inner}</svg>`;

/** A design rect scaled by `s` and rounded outward to whole device pixels. */
function pixelRect(r, s) {
  const x0 = Math.floor(r.x * s), y0 = Math.floor(r.y * s);
  return { x: x0, y: y0, w: Math.ceil((r.x + r.w) * s) - x0, h: Math.ceil((r.y + r.h) * s) - y0 };
}

/**
 * Pixel region P of a full-canvas design SVG rendered at the device's
 * width. Cropping a full render (rather than rendering just the region
 * through a shifted viewBox) keeps resvg's anti-aliasing identical to
 * the full screen at fractional scales, so pasted pieces match exactly.
 */
function renderRegion(svg, P, width) {
  const img = rasterize(svg, { width });
  const out = { w: P.w, h: P.h, px: new Uint8Array(P.w * P.h) };
  for (let y = 0; y < P.h; y++) out.px.set(img.px.subarray((P.y + y) * img.w + P.x, (P.y + y) * img.w + P.x + P.w), y * P.w);
  return out;
}

const fixture = {
  date: "2026-11-23",
  battery: 84,
  wetter: {
    now: { temp: 2, code: 71, wind: 19 }, sunset: "16:03",
    days: [{ date: "2026-11-23", code: 80, max: 3, min: 0, pop: 60, mm: 0.8 }, { date: "2026-11-24", code: 71, max: 3, min: 0, pop: 3, mm: 0 }, { date: "2026-11-25", code: 3, max: 2, min: -1, pop: 0, mm: 0 }],
  },
  updated: { wetter: "14:00" },
  praeposition: { wort: "sich freuen auf", kasus: "Akk.", bedeutung: "to look forward to", beispiel: "Wir freuen uns schon auf den Sommer auf dem Tempelhofer Feld." },
};

// ------------------------------------------------------------------
// Build
// ------------------------------------------------------------------

const t0 = performance.now();
await initRenderer();
const now = Date.now();
const events = buildSchedule(now, YEARS);
const checked = verifySchedule(events, now);
const bgKeys = [...new Set(events.map((e) => e.bg))];
let maxMinutes = 0;
for (let i = 1; i < events.length; i++) maxMinutes = Math.max(maxMinutes, Math.ceil((events[i].t - events[i - 1].t) / 60_000));
const schedule = events.map((e) => `${Math.round(e.t / 1000)} ${e.kind} ${e.bg}`).join("\n") + "\n";
const ver = version();

rmSync(OUT, { recursive: true, force: true });
const summary = [];

for (const deviceId of Object.keys(DEVICES)) {
  const dev = getDevice(deviceId);
  const s = dev.width / W;
  const canvas = { w: dev.width, h: dev.height };
  const out = `${OUT}/${deviceId}`;
  const png = (img) => encodePng(rotate(img, dev.rotate));
  for (const dir of ["dashboard/bin", "dashboard/fallback", "dashboard/img", "documents"]) mkdirSync(`${out}/${dir}`, { recursive: true });
  writeFileSync(`${out}/dashboard/schedule.txt`, schedule);

  const env = [
    `# Generated by kindle/build.mjs for ${deviceId} (${dev.name}, ${dev.width}×${dev.height}, rotation ${dev.rotate}) — eips positions are portrait framebuffer coordinates`,
    `VERSION=${ver}`,
    `DEVICE_ID=${deviceId}`,
    `SCREENS="${Object.keys(SCREENS).join(" ")}"`,
    `HOURLY_SCREENS="${HOURLY_SCREENS.join(" ")}"`,
    `DEFAULT_SCHEDULE="${dev.schedule ?? DEFAULT_SCHEDULE}"`,
  ];

  // Kindle-drawn boxes: Tempelhof panels + countdowns, once per box variant.
  const built = new Set();
  let pieces = 0;
  let compared = 0;
  for (const id of Object.keys(SCREENS)) {
    for (const b of deviceBoxes(id)) {
      // Module coordinates start TITLE_SPACE above the box (no section titles).
      const box = moduleBox(b);
      const top = b.y - TITLE_SPACE;
      const cb = tempelhof.countdownBox(box);
      const P = pixelRect(b, s);
      const C = pixelRect({ x: b.x + cb.x, y: top + cb.y, w: cb.w, h: cb.h }, s);
      const panelSvg = (state) => canvasSvg(`<g transform="translate(${b.x} ${top})">${tempelhof.render(box, state, { withCountdown: false })}</g>`);
      const cdSvg = (m) => canvasSvg(`<g transform="translate(${b.x + cb.x} ${top + cb.y})">${tempelhof.countdownSvg(box, m)}</g>`);
      const dir = `${out}/dashboard/tempelhof/${b.variant}`;
      if (!built.has(b.variant)) {
        built.add(b.variant);
        mkdirSync(`${dir}/panel`, { recursive: true });
        mkdirSync(`${dir}/cd`, { recursive: true });
        for (const key of bgKeys) {
          writeFileSync(`${dir}/panel/${key}.png`, png(renderRegion(panelSvg(stateForKey(key)), P, dev.width)));
          pieces++;
        }
        for (let m = 0; m <= maxMinutes; m++) {
          writeFileSync(`${dir}/cd/${m}.png`, png(renderRegion(cdSvg(m), C, dev.width)));
          pieces++;
        }
      }
      const tp = rotatedOrigin(P, dev.rotate, canvas);
      const cd = rotatedOrigin(C, dev.rotate, canvas);
      env.push(`DEVICE_${id}="tempelhof:${b.variant}"`, `TP_${id}_X=${tp.x}`, `TP_${id}_Y=${tp.y}`, `CD_${id}_X=${cd.x}`, `CD_${id}_Y=${cd.y}`);

      // Paste check: the server's base + the pasted panel and countdown must
      // reproduce the full design at this device's size, pixel for pixel.
      for (const [key, minutes] of [["open_0700-1800", 135], ["closed_0700-1800", 775]]) {
        const state = stateForKey(key, minutes);
        const data = { ...fixture, tempelhof: state };
        const full = rasterize(screenSvg(id, data, "full"), { width: dev.width });
        const composed = rasterize(screenSvg(id, data, "base"), { width: dev.width });
        paste(composed, renderRegion(panelSvg(state), P, dev.width), P);
        paste(composed, renderRegion(cdSvg(minutes), C, dev.width), C);
        let diff = 0;
        for (let i = 0; i < full.px.length; i++) if (full.px[i] !== composed.px[i]) diff++;
        if (diff > 0) throw new Error(`paste check failed for ${deviceId}/${id} (${key}): ${diff} pixels differ from the full render`);
        compared++;
      }
    }
  }

  // Fallback bases (no connection yet) for every screen.
  for (const id of Object.keys(SCREENS)) {
    writeFileSync(`${out}/dashboard/fallback/${id}.png`, png(rasterize(screenSvg(id, {}, "fallback"), { width: dev.width })));
  }

  // "Aktualisiere …" over the battery reading during a check-in.
  const U = pixelRect(UPDATING, s);
  const upd = canvasSvg(`<rect x="${UPDATING.x}" y="${UPDATING.y}" width="${UPDATING.w}" height="${UPDATING.h}" fill="#fff"/>` +
    text(UPDATING.x + UPDATING.w, UPDATING.y + 44, "Aktualisiere …", { size: 30, ink: INK.secondary }, { anchor: "end" }));
  writeFileSync(`${out}/dashboard/img/updating.png`, png(renderRegion(upd, U, dev.width)));
  const up = rotatedOrigin(U, dev.rotate, canvas);
  env.push(`UPD_X=${up.x}`, `UPD_Y=${up.y}`);
  writeFileSync(`${out}/dashboard/layout.env`, env.join("\n") + "\n");

  // Device script + scriptlets
  copyFileSync(`${REPO}/kindle/device/dashboard.sh`, `${out}/dashboard/bin/dashboard.sh`);
  for (const name of ["Dashboard.sh", "Dashboard test.sh", "Dashboard log.sh"]) {
    copyFileSync(`${REPO}/kindle/scriptlets/${name}`, `${out}/documents/${name}`);
  }
  summary.push(`${deviceId} ${dev.width}×${dev.height}: ${pieces} Tempelhof pieces, paste check ${compared}/${compared} identical`);
}

console.log(
  `kindle/dist: ${events.length} Tempelhof events (${YEARS}y, verified at ${checked} instants), ` +
    `${bgKeys.length} panels/variant, countdown to ${maxMinutes} min — ${((performance.now() - t0) / 1000).toFixed(1)}s\n  ` +
    summary.join("\n  "),
);
