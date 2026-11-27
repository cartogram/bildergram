#!/usr/bin/env node
// ============================================================
// kindle/build.mjs — builds the Kindle bundle (Phase 9)
// (`npm run kindle:build`).
//
// The server renders each screen's "base" (date, weather, cinema,
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
// It also checks that every Ausdruck and Präposition fits its card at
// each size the module draws (Phase 16).
//
// One bundle per device (kindle/lib/devices.mjs), drawn at its size:
// kindle/dist/<device>/
//   dashboard/   → copied to /mnt/us/dashboard on the Kindle
//   documents/   → scriptlets, copied to /mnt/us/documents
// ============================================================

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEVICES, device as getDevice } from "./lib/devices.mjs";
import { W, encodePng, initRenderer, paste, rasterize, rotate, rotatedOrigin, svgOpen } from "./lib/eink.mjs";
import * as tempelhof from "./lib/modules/tempelhof.mjs";
import { buildSchedule, hhmm, nextEvent } from "./lib/schedule.mjs";
import * as datum from "./lib/modules/datum.mjs";
import { HOURLY_SCREENS, SCREENS, boxSvg, deviceBoxes, moduleBox, screenSvg, tileAt } from "./lib/screens.mjs";
import { TILE_SIZES } from "./lib/design.mjs";
import * as ausdruck from "./lib/modules/ausdruck.mjs";
import * as praeposition from "./lib/modules/praeposition.mjs";
import { getTemplehofStatus } from "./lib/templehof.ts";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const OUT = `${REPO}/kindle/dist`;
const YEARS = 3; // schedule length — reinstall before it runs out


/** The date tile (the same cell on every screen), where "Aktualisiere …" covers the battery reading. */
const DATE_TILE = SCREENS.home.boxes.find((b) => b.module === "datum");
for (const [id, s] of Object.entries(SCREENS)) {
  const d = s.boxes.find((b) => b.module === "datum");
  if (!d || d.x !== DATE_TILE.x || d.y !== DATE_TILE.y || d.w !== DATE_TILE.w || d.h !== DATE_TILE.h) throw new Error(`screen ${id}: the date tile must sit where home's does`);
}
const UPDATING = (() => {
  const r = datum.updatingRect(moduleBox(DATE_TILE));
  return { x: DATE_TILE.x + r.x, y: DATE_TILE.y + r.y, w: r.w, h: r.h };
})();

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

/** Tempelhof state for a schedule background key such as "open_0700-1800" (gauge: `since`, `progress`). */
function stateForKey(key, minutes = 0, since = null, progress = 0) {
  const [kind, hours] = key.split("_");
  const [o, c] = hours.split("-").map((x) => `${x.slice(0, 2)}:${x.slice(2)}`);
  return { open: kind === "open", target: kind === "open" ? c : o, minutes, hours: [o, c], since, progress };
}

/** "0700" → "07:00". */
const colon = (x) => `${x.slice(0, 2)}:${x.slice(2)}`;

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

/**
 * Fit check (Phase 16): every Ausdruck and Präposition at each card size
 * must fit without overflowing or cutting a line short. Returns a summary
 * line (how many keep their Wörter, shrink, or lose the example).
 */
function verifyCards() {
  const asCard = (e) => ({ ausdruck: e.wort, bedeutung: `+ ${e.kasus} · ${e.bedeutung}`, beispiel: e.beispiel });
  const sets = [["Ausdruck", ausdruck.loadEntries()], ["Präposition", praeposition.loadEntries().map(asCard)]];
  const out = [];
  for (const size of ausdruck.sizes) {
    const [cols, rows] = TILE_SIZES[size];
    const box = moduleBox(tileAt("ausdruck", [0, 0, cols, rows]));
    for (const [name, entries] of sets) {
      const fits = entries.map((e) => ausdruck.fit(box, e));
      const bad = fits.findIndex((f) => !f.fits);
      if (bad >= 0) throw new Error(`${name} ${bad} („${entries[bad].ausdruck}“) doesn't fit the ${size} card`);
      const n = (f) => fits.filter(f).length;
      out.push(`${size} ${name} ${entries.length}: ${n((f) => f.words)} with Wörter, ${n((f) => f.k < 1)} shrunk, ${n((f) => !f.example)} without example`);
    }
  }
  return out.join("; ");
}

const fixture = {
  date: "2026-11-23",
  battery: 84,
  wetter: {
    now: { temp: 2, code: 71, wind: 19 }, sunset: "16:03",
    days: [{ date: "2026-11-23", code: 80, max: 3, min: 0, pop: 60, mm: 0.8 }, { date: "2026-11-24", code: 71, max: 3, min: 0, pop: 3, mm: 0 }, { date: "2026-11-25", code: 3, max: 2, min: -1, pop: 0, mm: 0 }],
  },
  updated: { wetter: "14:00" },
  ausdruck: { ausdruck: "sein blaues Wunder erleben", bedeutung: "to be in for a nasty surprise", beispiel: "Wer an Silvester ohne Reservierung kommt, wird sein blaues Wunder erleben." },
  kino: {
    from: "18:00",
    programme: { cinemas: [{ slug: "rollberg", name: "Rollberg", sessions: [{ date: "2026-11-23", time: "19:30", title: "Perfect Days", film: null, formats: ["OmU"] }] }] },
  },
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
const cardFit = verifyCards();
const bgKeys = [...new Set(events.map((e) => e.bg))];
// Gauge label pairs "since-target" (e.g. "1800-0700") per state: the previous event's time and the next one's.
const gaugePairs = { open: new Set(), closed: new Set() };
events.slice(1).forEach((e, i) => gaugePairs[e.kind === "close" ? "open" : "closed"].add(`${hhmm(events[i].label)}-${hhmm(e.label)}`));
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
    `DEFAULT_SCREEN="${dev.screen}"`,
    `GAUGE_STEPS=${tempelhof.GAUGE_STEPS}`,
  ];

  // Kindle-drawn boxes: Tempelhof panels + countdowns, once per box variant.
  const built = new Set();
  let pieces = 0;
  let compared = 0;
  for (const id of Object.keys(SCREENS)) {
    for (const b of deviceBoxes(id)) {
      const box = moduleBox(b);
      const top = b.y;
      const P = pixelRect(b.tile, s); // the whole tile: the base leaves it out
      // The countdown follows the sentence, so its position (and, at a
      // fractional scale, its anti-aliasing) differs per state.
      const C = {};
      for (const st of ["open", "closed"]) {
        const cb = tempelhof.countdownBox(box, st === "open");
        C[st] = { cb, r: pixelRect({ x: b.x + cb.x, y: top + cb.y, w: cb.w, h: cb.h }, s) };
      }
      // Pieces carry the tile itself (the base leaves the whole tile blank).
      const panelSvg = (state) => canvasSvg(boxSvg(b, tempelhof.render(box, state, { withCountdown: false, withGauge: false })));
      // The gauge (short tiles): a piece per label pair and step, cropped from the tile with only the gauge drawn.
      // Its place and shape differ per state ("n" open, "u" closed).
      const gauge = tempelhof.hasGauge(box);
      const G = {};
      if (gauge) {
        for (const st of ["open", "closed"]) {
          const gb = tempelhof.gaugeBox(box, st === "open");
          G[st] = pixelRect({ x: b.x + gb.x, y: top + gb.y, w: gb.w, h: gb.h }, s);
        }
      }
      const gaugeSvg = (st, pair, step) => {
        const [since, target] = pair.split("-").map(colon);
        return canvasSvg(boxSvg(b, tempelhof.gaugeSvg(box, since, target, step, st === "open")));
      };
      // Countdown pieces are cropped from the whole line (the sentence before
      // the countdown is the same for every state key of open/closed), so
      // anti-aliasing at the piece's edge matches the full render.
      const repKey = { open: bgKeys.find((k) => k.startsWith("open")), closed: bgKeys.find((k) => k.startsWith("closed")) };
      const cdSvg = (st, m) => canvasSvg(boxSvg(b, tempelhof.render(box, stateForKey(repKey[st], m), { withGauge: false })));
      const dir = `${out}/dashboard/tempelhof/${b.variant}`;
      if (!built.has(b.variant)) {
        built.add(b.variant);
        mkdirSync(`${dir}/panel`, { recursive: true });
        for (const st of ["open", "closed"]) mkdirSync(`${dir}/cd/${st}`, { recursive: true });
        for (const key of bgKeys) {
          writeFileSync(`${dir}/panel/${key}.png`, png(renderRegion(panelSvg(stateForKey(key)), P, dev.width)));
          pieces++;
        }
        for (const st of ["open", "closed"]) {
          for (let m = 0; m <= maxMinutes; m++) {
            writeFileSync(`${dir}/cd/${st}/${m}.png`, png(renderRegion(cdSvg(st, m), C[st].r, dev.width)));
            pieces++;
          }
        }
        for (const st of gauge ? ["open", "closed"] : []) {
          for (const pair of gaugePairs[st]) {
            mkdirSync(`${dir}/gauge/${st}/${pair}`, { recursive: true });
            for (let step = 0; step <= tempelhof.GAUGE_STEPS; step++) {
              writeFileSync(`${dir}/gauge/${st}/${pair}/${step}.png`, png(renderRegion(gaugeSvg(st, pair, step), G[st], dev.width)));
              pieces++;
            }
          }
        }
      }
      for (const st of gauge ? ["open", "closed"] : []) {
        const gg = rotatedOrigin(G[st], dev.rotate, canvas);
        env.push(`GG_${id}_${st}_X=${gg.x}`, `GG_${id}_${st}_Y=${gg.y}`);
      }
      const tp = rotatedOrigin(P, dev.rotate, canvas);
      env.push(`DEVICE_${id}="tempelhof:${b.variant}"`, `TP_${id}_X=${tp.x}`, `TP_${id}_Y=${tp.y}`);
      for (const st of ["open", "closed"]) {
        const cd = rotatedOrigin(C[st].r, dev.rotate, canvas);
        env.push(`CD_${id}_${st}_X=${cd.x}`, `CD_${id}_${st}_Y=${cd.y}`);
      }

      // Paste check: the server's base + the pasted panel and countdown must
      // reproduce the full design at this device's size, pixel for pixel.
      for (const [key, minutes, since, progress] of [["open_0700-1800", 135, "07:00", 0.8], ["closed_0700-1800", 775, "18:00", 0.04]]) {
        const state = stateForKey(key, minutes, since, progress);
        const data = { ...fixture, tempelhof: state };
        const full = rasterize(screenSvg(id, data, "full"), { width: dev.width });
        const composed = rasterize(screenSvg(id, data, "base"), { width: dev.width });
        paste(composed, renderRegion(panelSvg(state), P, dev.width), P);
        const st = key.startsWith("open") ? "open" : "closed";
        paste(composed, renderRegion(cdSvg(st, minutes), C[st].r, dev.width), C[st].r);
        if (gauge) paste(composed, renderRegion(gaugeSvg(st, `${hhmm(since)}-${hhmm(state.target)}`, tempelhof.gaugeStep(state)), G[st], dev.width), G[st]);
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
  const upd = canvasSvg(boxSvg(DATE_TILE, datum.render(moduleBox(DATE_TILE), { date: fixture.date, updating: true })));
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
    summary.join("\n  ") + `\n  cards fit: ${cardFit}`,
);
