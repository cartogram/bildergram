#!/usr/bin/env node
// ============================================================
// kindle/design-system.mjs — the tile design system on one page
// (`npm run kindle:design`; Phase 8, tiles since Phase 14). The grid,
// the proposed tile type scale and inks (design.mjs TILE_TYPE,
// TILE_INK), tiles and pills, every card in each of its states, and
// an audit of what the cards use now against the proposal. Rendered
// through the real e-ink pipeline into
// kindle/dist/gallery/design-system.html.
// ============================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cell, circleLabel, GRID, pill, text, tile, TILE_INK, TILE_INK_DARK, TILE_PAD, TILE_TYPE } from "./lib/design.mjs";
import { encodePng, initRenderer, rasterize, svgOpen, W } from "./lib/eink.mjs";
import * as datum from "./lib/modules/datum.mjs";
import { fetchWeather } from "./lib/modules/wetter.mjs";
import { berlinDate } from "./lib/render.mjs";
import { berlinParts, berlinToUtc, buildSchedule, tempelhofState } from "./lib/schedule.mjs";
import { boxSvg, moduleBox, moduleSvg, SCREENS, tileAt } from "./lib/screens.mjs";
import { mockAusdruck, mockAusdruck2, sampleFitness, sampleProgramme } from "./samples.mjs";

const OUT = fileURLToPath(new URL("./dist/gallery/", import.meta.url));
mkdirSync(OUT, { recursive: true });
await initRenderer();

const X = 24;
const note = (x, y, s) => text(x, y, s, { size: 22, weight: "bold", ink: TILE_INK.faint });
const sections = [];
let n = 0;

/** A specimen image: `draw` returns SVG for a 1448 × h canvas. */
function specimen(group, title, sub, h, draw) {
  const file = `ds-${String(++n).padStart(2, "0")}.png`;
  writeFileSync(`${OUT}${file}`, encodePng(rasterize(svgOpen(W, h) + draw() + "</svg>")));
  sections.push({ group, title, sub, file, h });
}

// ---------------- Data ----------------

const now = Date.now();
const date = berlinDate(now);
const p = berlinParts(now);
const at = (h, mi) => berlinToUtc(p.y, p.m, p.d, h, mi);
const events = buildSchedule(now, 1);
const weather = await fetchWeather();
const data = {
  date,
  battery: 84,
  wetter: weather,
  kino: { programme: sampleProgramme(date), from: "18:00" },
  ausdruck: mockAusdruck,
  fitness: sampleFitness(date, new Date(now).toISOString()),
};

// ---------------- Grid ----------------

specimen("Grid", "8 × 4 cells", `${GRID.col} × ${GRID.row} cells, ${GRID.gap} gutters, ${GRID.margin} margin; tiles span whole cells, content ${TILE_PAD} inside (Morgen's tiles outlined)`, 1072, () => {
  let svg = "";
  for (let c = 0; c < 8; c++) for (let r = 0; r < 4; r++) {
    const q = cell(c, r);
    svg += `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="#eeeeee"/>`;
  }
  for (const b of SCREENS.morgen.boxes) {
    svg += tile(b.tile, "outline") + note(b.tile.x + 20, b.tile.y + 40, `${b.module}${b.variant ? ` · ${b.variant}` : ""}`);
    svg += note(b.tile.x + 20, b.tile.y + 70, `${b.tile.w} × ${b.tile.h}`);
  }
  return svg;
});

// ---------------- Type ----------------

const typeUse = {
  display: "the one big figure: temperature, day of the month",
  heading: "the body size, bold: the Ausdruck, the month",
  body: "sentences, rows, values (figures bold)",
  label: "a tile's title and field labels; the weekday",
  small: "secondary lines, legends, pills, the Feld line",
};
specimen("Type", "Tile type scale (proposed)", "TILE_TYPE: five sizes; bold only where marked", 600, () => {
  let y = 0, svg = "";
  for (const [name, style] of Object.entries(TILE_TYPE)) {
    y += Math.max(84, Math.round(style.size * 1.15) + 26);
    svg += note(X, y - 30, name) + note(X, y - 4, `${style.size}${style.weight ? " bold" : ""}`);
    const sample = name === "display" ? "24 · 2°" : name === "heading" ? "„sein blaues Wunder erleben“" : name === "label" ? "Im Kino · Niederschlag · Matt" : name === "small" ? "Feld schließt in 3h 55min · Akku 84 %" : "Wer an Silvester ohne Reservierung kommt, …";
    svg += text(220, y, sample, style);
    svg += note(900, y - 4, typeUse[name]);
  }
  return svg;
});

// ---------------- Inks ----------------

const inkUse = {
  ink: "text, figures; time still to go; today's ring",
  muted: "secondary text (meanings, values); the week ring",
  faint: "tertiary text (lows, plurals); the year ring",
  line: "tracks; time gone by",
  paper: "the page and tiles",
};
specimen("Color", "Tile inks (proposed)", "TILE_INK on paper and TILE_INK_DARK on the date tile — all on the panel's 16 levels (multiples of 17)", 420, () => {
  let svg = "";
  Object.entries(TILE_INK).forEach(([name, hex], i) => {
    const x = X + i * 280;
    svg += `<rect x="${x}" y="20" width="250" height="100" rx="16" fill="${hex}" stroke="#000" stroke-width="2"/>`;
    svg += text(x, 158, name, TILE_TYPE.label) + note(x, 188, hex);
    svg += text(x, 218, inkUse[name].split(";")[0], { size: 18, ink: TILE_INK.muted });
    if (inkUse[name].includes(";")) svg += text(x, 242, inkUse[name].split(";").slice(1).join(";").trim(), { size: 18, ink: TILE_INK.muted });
  });
  // On the dark tile.
  svg += `<rect x="${X}" y="276" width="${W - 2 * X}" height="120" rx="32" fill="${TILE_INK_DARK.paper}"/>`;
  Object.entries(TILE_INK_DARK).filter(([k]) => k !== "paper").forEach(([name, hex], i) => {
    const x = X + 40 + i * 330;
    svg += `<circle cx="${x + 18}" cy="336" r="18" fill="${hex}"/>` + text(x + 52, 345, `${name} ${hex}`, { size: 28, weight: "bold", ink: hex === "#444444" ? "#aaaaaa" : hex });
  });
  return svg;
});

// ---------------- Tiles and pills ----------------

specimen("Components", "Tiles and pills", "tile(): outline, light (Kino, Ausdruck), fill (Wetter, Feld), dark (date, Matt, Fiona), bleed (no container) · pill() and circleLabel(), both 32 high", 300, () => {
  const t = (x, style) => tile({ x, y: 20, w: 220, h: 160 }, style) + note(x + 20, 210, style);
  let svg = t(X, "outline") + t(X + 240, "light") + t(X + 480, "fill") + t(X + 720, "dark") +
    `<rect x="${X + 960}" y="20" width="220" height="160" fill="none" stroke="#bbb" stroke-dasharray="6 6"/>` + note(X + 980, 100, "no container") + note(X + 980, 210, "bleed");
  svg += pill(X + 1210, 70, "18:00").svg + circleLabel(X + 1340, 62, "R");
  svg += `<rect x="${X + 1200}" y="100" width="190" height="70" rx="20" fill="#000"/>` + pill(X + 1214, 145, "Akku 84 %", { fill: "#fff", ink: "#000" }).svg;
  return svg;
});

// ---------------- Cards ----------------

/**
 * Cards in a row: each [module, cols, rows, opts, data, mode, caption].
 * Laid out left to right on the real grid's cell sizes.
 */
function cards(title, sub, list) {
  const rows = Math.max(...list.map((c) => c[2]));
  const h = cell(0, 0, 1, rows).h + 2 * GRID.margin + 34;
  specimen("Cards", title, sub, h, () => {
    let svg = "";
    let col = 0;
    for (const [module, cols, rs, opts = {}, d = data, mode = "full", caption = ""] of list) {
      const b = tileAt(module, [col, 0, cols, rs], opts);
      const inner = opts.updating ? datum.render(moduleBox(b), { date: d.date, battery: d.battery, updating: true }) : moduleSvg(b, d, mode);
      svg += boxSvg(b, inner, "outline");
      if (caption) svg += note(b.tile.x + 8, b.tile.y + b.tile.h + 28, caption);
      col += cols;
    }
    return svg;
  });
}

const feld = (ms) => ({ ...data, tempelhof: tempelhofState(events, ms) });
cards("Datum and Feld", "2 × 1 each; the Feld is drawn on the Kindle (gauge pieces per state)", [
  ["datum", 2, 1, { tone: "dark" }, data, "full", "datum"],
  ["datum", 2, 1, { tone: "dark", updating: true }, data, "full", "datum · during a check-in"],
  ["tempelhof", 2, 1, { variant: "morgen", tone: "fill" }, feld(at(14, 5)), "full", "tempelhof · open"],
  ["tempelhof", 2, 1, { variant: "morgen", tone: "fill" }, feld(at(5, 30)), "full", "tempelhof · closed"],
]);
cards("Wetter", "2 × 2; the three column variants", [
  ["wetter", 2, 2, { variant: "mixed", tone: "fill" }, data, "full", "mixed (Morgen, fill)"],
  ["wetter", 2, 2, { variant: "details" }, data, "full", "details"],
  ["wetter", 2, 2, { variant: "days" }, data, "full", "days"],
  ["datum", 2, 1, { tone: "dark" }, {}, "fallback", "datum · no connection"],
]);
cards("Im Kino and Ausdruck", "4 × 2 each (sample listing, mock Wörter)", [
  ["kino", 4, 2, { variant: "tonight", tone: "light" }, data, "full", "kino · tonight (light)"],
  ["ausdruck", 4, 2, { variant: "card", tone: "light" }, data, "full", "ausdruck · card (light)"],
]);
cards("Ausdruck", "4 × 2, light border: two expressions with mock Wörter", [
  ["ausdruck", 4, 2, { variant: "card", tone: "light" }, data, "full", "sein blaues Wunder erleben"],
  ["ausdruck", 4, 2, { variant: "card", tone: "light" }, { ...data, ausdruck: mockAusdruck2 }, "full", "etwas auf die lange Bank schieben"],
]);
cards("Bewegung", "2 × 2 per person (sample minutes)", [
  ["fitness", 2, 2, { variant: "person", person: "Matt", tone: "dark" }, data, "full", "Matt"],
  ["fitness", 2, 2, { variant: "person", person: "Fiona", tone: "dark" }, data, "full", "Fiona"],
  ["fitness", 2, 2, { variant: "person", person: "Matt", tone: "dark" }, { ...data, fitness: { people: [] } }, "full", "no data yet"],
]);

// ---------------- Audit ----------------

/** What the cards use now, and the proposed token each maps to. */
const typeAudit = [
  ["Day of the month (Datum)", "88 bold", "display (104 doesn't fit with Akku)"],
  ["Temperature (Wetter)", "104 bold", "display"],
  ["Weekday (Datum)", "28 bold, was 40", "label ✓"],
  ["Month (Datum)", "32 bold, was 40", "heading ✓"],
  ["The Ausdruck", "40 bold", "heading (32 bold)"],
  ["Example sentence (Ausdruck)", "40", "body (smaller)"],
  ["Kino rows", "30, time bold", "body"],
  ["Wetter values, high/low, day temperatures", "32 bold", "body bold"],
  ["Tile titles: Tempelhof, Im Kino, Matt", "28 bold", "label"],
  ["Wetter labels: Niederschlag, Wind, Mi", "28 bold", "label"],
  ["Meaning (“to be in for …”)", "26 bold #333", "small, muted"],
  ["“heute ab 18:00”, “+ 3 weitere”", "26 bold #333", "small, muted"],
  ["Wörter", "26 (article bold)", "small"],
  ["Feld line, times, Akku, legend", "24", "small"],
  ["Cinema letter", "24 bold in a 32 circle (two letters shrink)", "small ✓"],
  ["Pills: Feld times, Akku", "24 bold in a 32 pill", "small ✓"],
];
const inkAudit = [
  ["#000000", "text, still-to-go dots, today's ring", "ink"],
  ["#333333", "secondary text (TYPE.caption)", "muted #555"],
  ["#555555", "week ring", "muted"],
  ["#666666", "tertiary text: lows, plurals, Wetter values", "faint #888"],
  ["#999999", "year ring", "faint #888"],
  ["#bbbbbb", "Feld dots gone by", "line #ccc"],
  ["#cccccc", "date tile secondary text", "dark muted #aaa"],
  ["#dddddd", "ring tracks", "line #ccc"],
  ["#eeeeee", "the filled tile style", "(tile style)"],
];
const table = (head, rows) =>
  `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => `<td>${i === 0 && c.startsWith("#") ? `<span class="sw" style="background:${c}"></span>${c}` : c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;

// ---------------- Page ----------------

const groups = [...new Set(sections.map((s) => s.group))];
writeFileSync(
  `${OUT}design-system.html`,
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tile Design System</title>
<style>
  :root { --bg: #e9e7e3; --ink: #1b1a18; --muted: #6a675f; --card: #fff; --line: #d4d1ca; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #1b1b1d; --ink: #ecebe8; --muted: #a09d97; --card: #26262a; --line: #3a3a3f; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; }
  main { max-width: 1520px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 18px; margin: 28px 0 10px; } h3 { font-size: 16px; margin: 0; }
  p { color: var(--muted); margin: 0 0 16px; }
  nav { display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 8px; } nav a { color: var(--ink); }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; margin-bottom: 14px; overflow-x: auto; }
  section p { margin: 2px 0 10px; font-size: 14px; }
  img { display: block; width: 100%; height: auto; background: #fff; border: 1px solid var(--line); }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; }
  .sw { display: inline-block; width: 14px; height: 14px; border: 1px solid #888; border-radius: 3px; margin-right: 8px; vertical-align: -2px; }
</style>
<main>
  <h1>Kindle tile design system</h1>
  <p>The 8 × 4 grid, the proposed tile type scale and inks (design.mjs TILE_TYPE and TILE_INK, not yet applied to the cards), and every card as it renders today — Arimo, 16 gray levels, the 1448 px canvas. Rendered ${date}.</p>
  <nav>${groups.map((g) => `<a href="#${g}">${g}</a>`).join("")}<a href="#Audit">Audit</a></nav>
  ${groups.map((g) => `<h2 id="${g}">${g}</h2>\n  ${sections.filter((s) => s.group === g).map((s) => `<section><h3>${s.title}</h3><p>${s.sub}</p><img src="${s.file}" width="1448" height="${s.h}" alt="${s.title}"></section>`).join("\n  ")}`).join("\n  ")}
  <h2 id="Audit">Audit: today → proposed</h2>
  <section><h3>Type</h3><p>Thirteen sizes today; five proposed.</p>${table(["Where", "Now", "Proposed"], typeAudit)}</section>
  <section><h3>Color</h3><p>Nine grays today; four inks proposed (plus the filled tile style).</p>${table(["Gray", "Used for", "Proposed"], inkAudit)}</section>
</main>`,
);
console.log(`design system: ${sections.length} specimens → ${OUT}design-system.html`);
