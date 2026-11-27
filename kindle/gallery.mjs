#!/usr/bin/env node
// ============================================================
// kindle/gallery.mjs — render every screen from live data for
// review (`npm run kindle:gallery`). Writes
// kindle/dist/gallery/index.html and one PNG per screen, at the
// panel's real size and 16 gray levels (landscape, unrotated).
// ============================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deDateLong, deTime } from "./lib/design.mjs";
import { encodePng, initRenderer, rasterize } from "./lib/eink.mjs";
import { fetchProgramme } from "./lib/kino.mjs";
import { entryFor, loadEntries as loadAusdruecke } from "./lib/modules/ausdruck.mjs";
import { parseFitness, weekOf } from "./lib/modules/fitness.mjs";
import { entryFor as praepositionFor } from "./lib/modules/praeposition.mjs";
import { fetchWeather } from "./lib/modules/wetter.mjs";
import { berlinParts, berlinToUtc, buildSchedule, tempelhofState } from "./lib/schedule.mjs";
import { SCREENS, boxSvg, moduleBox, moduleSvg, screenSvg, tileAt } from "./lib/screens.mjs";
import { cell, TILE_PAD } from "./lib/design.mjs";
import * as wetter from "./lib/modules/wetter.mjs";
import { svgOpen, W, H } from "./lib/eink.mjs";
import { sampleProgramme } from "./lib/samples.mjs";

const OUT = fileURLToPath(new URL("./dist/gallery/", import.meta.url));
mkdirSync(OUT, { recursive: true });

await initRenderer();
const now = Date.now();
const p = berlinParts(now);
const date = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
const at = (h, mi) => berlinToUtc(p.y, p.m, p.d, h, mi);
const events = buildSchedule(now, 1);

const [weather, programme] = await Promise.all([fetchWeather(), fetchProgramme()]);
const base = {
  date,
  battery: 84,
  wetter: weather,
  updated: { wetter: deTime(weather.fetchedAt) },
  kino: { programme, from: "18:00", updated: `${deTime(programme.fetchedAt)}` },
  ausdruck: entryFor(date),
  praeposition: praepositionFor(date),
  tempelhof: tempelhofState(events, now),
};

// Sample exercise minutes (the real ones come from the iPhones via the hub).
const week = weekOf(date);
const sample = (mins) => Object.fromEntries(week.map((d, i) => [d, mins[i]]).filter(([d]) => d <= date));
const synced = new Date(at(21, 40)).toISOString();
const fitness = (people) => parseFitness({ people });
const fitnessScenes = [
  null,
  fitness([
    { name: "Matt", goal: 150, days: sample([32, 0, 45, 18, 60, 0, 25]), year: 5940, syncedAt: synced },
    { name: "Fiona", goal: 150, days: sample([55, 40, 0, 62, 30, 75, 20]), year: 7120, syncedAt: new Date(at(18, 5)).toISOString() },
  ]),
  fitness([
    { name: "Matt", goal: 150, days: {}, syncedAt: null },
    { name: "Fiona", goal: 200, days: sample([12, 0, 0, 0, 0, 0, 0]), syncedAt: new Date(at(7, 15) - 86_400_000).toISOString() },
  ]),
];

const programmeSample = sampleProgramme(date);

// Sample listing and minutes so every tile is full at any hour (yorck.de drops screenings once they start).
const full = { ...base, kino: { ...base.kino, programme: programmeSample }, fitness: fitnessScenes[1] };
const feldAt = (h, mi) => tempelhofState(events, at(h, mi));
// The entry with the most Wörter, to check the card fits them.
const ausdruecke = loadAusdruecke();
const mostWords = ausdruecke.reduce((a, b) => ((b.woerter?.length ?? 0) > (a.woerter?.length ?? 0) ? b : a));

const scenes = [
  { id: "home", when: "07:30", note: "sample listing and minutes", data: { ...full, tempelhof: feldAt(7, 30) } },
  { id: "home", when: "05:30", note: "Feld closed", data: { ...full, tempelhof: feldAt(5, 30) } },
  { id: "home", when: "22:30", note: "Kino shows tomorrow's listing", data: { ...full, kino: { ...full.kino, day: "morgen" }, tempelhof: feldAt(22, 30) } },
  { id: "home", when: "07:30", note: "the Ausdruck with the most Wörter", data: { ...full, ausdruck: mostWords, tempelhof: feldAt(7, 30) } },
  { id: "home", when: "07:30", note: "no exercise data yet / stale sync", data: { ...full, fitness: fitnessScenes[2], tempelhof: feldAt(7, 30) } },
  { id: "home", when: "07:30", note: "no connection (fallback)", data: {}, mode: "fallback" },
];

const t0 = performance.now();
const cards = scenes.map((s, i) => {
  const file = `${String(i + 1).padStart(2, "0")}-${s.id}.png`;
  writeFileSync(`${OUT}${file}`, encodePng(rasterize(screenSvg(s.id, s.data, s.mode ?? "full"))));
  return { file, title: `${SCREENS[s.id].name}`, sub: `${s.when}${s.note ? ` · ${s.note}` : ""}` };
});

// The weather tile's variants side by side.
{
  const tiles = [["details", [0, 0, 2, 2]], ["days", [2, 0, 2, 2]], ["mixed", [4, 0, 2, 2]]];
  let svg = svgOpen(W, H);
  for (const [variant, [c, r, n, m]] of tiles) {
    const t = cell(c, r, n, m);
    const b = { module: "wetter", variant, tone: "fill", tile: t, x: t.x + TILE_PAD, y: t.y + TILE_PAD, w: t.w - 2 * TILE_PAD, h: t.h - 2 * TILE_PAD };
    svg += boxSvg(b, wetter.render(moduleBox(b), weather));
  }
  const file = `${String(cards.length + 1).padStart(2, "0")}-wetter.png`;
  writeFileSync(`${OUT}${file}`, encodePng(rasterize(svg + "</svg>")));
  cards.push({ file, title: "Wetter tiles", sub: "details · days · mixed" });
}

// Medium cards (Phase 16) on a whole screen: one possible home with Kino, Ausdruck and Präposition at 2 × 2.
{
  const tiles = [
    tileAt("datum", [0, 0, 2, 1], { tone: "dark" }),
    tileAt("tempelhof", [0, 1, 2, 1], { variant: "feld", tone: "fill" }),
    tileAt("wetter", [2, 0, 2, 2], { variant: "mixed", tone: "fill" }),
    tileAt("ausdruck", [4, 0, 2, 2], { tone: "light" }),
    tileAt("praeposition", [6, 0, 2, 2], { tone: "light" }),
    tileAt("kino", [0, 2, 2, 2], { tone: "light" }),
    tileAt("fitness", [2, 2, 2, 2], { variant: "person", person: "Matt", tone: "dark" }),
    tileAt("fitness", [4, 2, 2, 2], { variant: "person", person: "Fiona", tone: "dark" }),
    tileAt("wetter", [6, 2, 2, 2], { variant: "days", tone: "fill" }),
  ];
  const d = { ...full, tempelhof: feldAt(7, 30) };
  const svg = svgOpen(W, H) + tiles.map((b) => boxSvg(b, moduleSvg(b, d))).join("") + "</svg>";
  const file = `${String(cards.length + 1).padStart(2, "0")}-medium.png`;
  writeFileSync(`${OUT}${file}`, encodePng(rasterize(svg)));
  cards.push({ file, title: "Medium cards", sub: "Kino, Ausdruck and Präposition at 2 × 2 (a layout idea, not a screen)" });
}

writeFileSync(
  `${OUT}index.html`,
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Screen Gallery</title>
<style>
  :root { --bg: #e9e7e3; --ink: #1b1a18; --muted: #6a675f; --card: #fff; --line: #d4d1ca; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #1b1b1d; --ink: #ecebe8; --muted: #a09d97; --card: #26262a; --line: #3a3a3f; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; }
  main { max-width: 1520px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 22px; margin: 0 0 4px; } p { color: var(--muted); margin: 0 0 20px; }
  .bar { display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap; }
  button { font: inherit; font-size: 13px; padding: 5px 11px; border-radius: 6px; border: 1px solid var(--line); background: var(--card); color: var(--ink); cursor: pointer; }
  button[aria-pressed="true"] { background: var(--ink); color: var(--bg); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 680px), 1fr)); gap: 18px; }
  .actual .grid { grid-template-columns: 1fr; }
  figure { margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; min-width: 0; }
  figcaption { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 14px; }
  figcaption span { color: var(--muted); }
  .frame { overflow: auto; }
  img { display: block; width: 100%; height: auto; background: #fff; border: 1px solid var(--line); image-rendering: auto; }
  .actual img { width: 1448px; max-width: none; image-rendering: pixelated; }
</style>
<main>
  <h1>Kindle screens — Phase 16 design review</h1>
  <p>Rendered ${deDateLong(date)} from live data (Open-Meteo, yorck.de, Tempelhof schedule) at the Paperwhite 3's 1448 × 1072, 16 gray levels.</p>
  <div class="bar"><button id="fit" aria-pressed="true">Fit</button><button id="actual" aria-pressed="false">Actual pixels</button></div>
  <div class="grid">
  ${cards.map((c) => `<figure><figcaption><b>${c.title}</b><span>${c.sub}</span></figcaption><div class="frame"><img src="${c.file}" alt="${c.title} screen at ${c.sub}"></div></figure>`).join("\n  ")}
  </div>
</main>
<script>
  for (const id of ["fit", "actual"]) document.getElementById(id).onclick = () => {
    document.body.classList.toggle("actual", id === "actual");
    for (const b of document.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.id === id));
  };
</script>`,
);
console.log(`gallery: ${cards.length} screens in ${((performance.now() - t0) / 1000).toFixed(1)}s → ${OUT}index.html`);
