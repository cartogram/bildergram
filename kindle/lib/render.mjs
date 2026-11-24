// ============================================================
// kindle/lib/render.mjs — load data for a screen and render it
// (Phase 9). Used by the Vercel function (api/screen.mjs), the
// gallery and the local renderer dev server, so every path draws a
// screen the same way.
// ============================================================

import { deTime } from "./design.mjs";
import { encodePng, initRenderer, rasterize, rotate } from "./eink.mjs";
import { device } from "./devices.mjs";
import { DEFAULT_CINEMAS, fetchProgramme, withoutSeen } from "./kino.mjs";
import { entryFor } from "./modules/ausdruck.mjs";
import { parseFitness } from "./modules/fitness.mjs";
import { entryFor as praepositionFor } from "./modules/praeposition.mjs";
import { fetchWeather } from "./modules/wetter.mjs";
import { berlinParts, buildSchedule, tempelhofState } from "./schedule.mjs";
import { SCREENS, screenSvg } from "./screens.mjs";

/** Berlin calendar date of an epoch (ms) as YYYY-MM-DD. */
export function berlinDate(ms = Date.now()) {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}

/** The Kino tile's listing at `ms`: today's ("heute") until 22:00 Berlin time, then tomorrow's ("morgen"). */
export function kinoDay(ms) {
  if (berlinParts(ms).h < 22) return { date: berlinDate(ms), day: "heute" };
  return { date: berlinDate(ms + 3 * 3_600_000), day: "morgen" };
}

/**
 * Data for the modules on screen `id`. Only what the screen shows is
 * fetched. `now` (ms) drives the Tempelhof state for full renders.
 */
export async function screenData(id, {
  date = berlinDate(), battery = null, cinemas = DEFAULT_CINEMAS, from = "18:00", letterboxd = null, hidden = [], fitness = null, now = Date.now(),
} = {}) {
  const modules = new Set(SCREENS[id].boxes.map((b) => b.module));
  const data = { date, battery };
  const jobs = [];
  if (modules.has("wetter")) {
    jobs.push(fetchWeather().then((w) => {
      data.wetter = w;
      data.updated = { wetter: deTime(w.fetchedAt) };
    }));
  }
  if (modules.has("kino")) {
    // The Kino tile (Morgen) follows the clock, not the slot: today's
    // listing until 22:00, then tomorrow's until midnight. The full listing
    // (Abend) stays on the slot's date.
    const tile = SCREENS[id].boxes.some((b) => b.module === "kino" && b.variant === "tonight");
    const listing = tile ? kinoDay(now) : { date, day: "heute" };
    // Drop films already seen on Letterboxd or hidden by hand; only this
    // listing's films (that date, from `from`) are looked up.
    jobs.push(fetchProgramme(cinemas)
      .then((p) => withoutSeen(p, { letterboxd, hidden, keep: (s) => s.date === listing.date && s.time >= from }))
      .then((p) => {
        data.kino = { programme: p, from, updated: deTime(p.fetchedAt), ...listing };
      }));
  }
  if (modules.has("ausdruck")) data.ausdruck = entryFor(date);
  if (modules.has("praeposition")) data.praeposition = praepositionFor(date);
  // Exercise minutes come from the hub (the iPhones post them there).
  if (modules.has("fitness")) data.fitness = parseFitness(fitness);
  if (modules.has("tempelhof")) data.tempelhof = tempelhofState(buildSchedule(now, 1), now);
  await Promise.all(jobs);
  return data;
}

/**
 * PNG of screen `id` for a device (kindle/lib/devices.mjs): drawn at the
 * device's width. mode "base" (Kindle-drawn boxes blank, rotated for
 * eips), "full" (everything, landscape: previews) or "fallback".
 */
export async function renderScreen(id, opts = {}, mode = "base", deviceId) {
  await initRenderer();
  const dev = device(deviceId);
  const data = mode === "fallback" ? {} : await screenData(id, opts);
  const img = rasterize(screenSvg(id, data, mode), { width: dev.width });
  return encodePng(mode === "full" ? img : rotate(img, dev.rotate));
}
