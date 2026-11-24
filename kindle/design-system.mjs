#!/usr/bin/env node
// ============================================================
// kindle/design-system.mjs — the design system on one page
// (`npm run kindle:design`). Every token, primitive, icon and module
// variant, rendered through the real e-ink pipeline (Arimo, 16 grays,
// 1448 px wide) into kindle/dist/gallery/design-system.html.
// ============================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as D from "./lib/design.mjs";
import { encodePng, initRenderer, rasterize, svgOpen, W } from "./lib/eink.mjs";
import { fetchProgramme } from "./lib/kino.mjs";
import * as ausdruck from "./lib/modules/ausdruck.mjs";
import * as fitness from "./lib/modules/fitness.mjs";
import * as kino from "./lib/modules/kino.mjs";
import * as praeposition from "./lib/modules/praeposition.mjs";
import * as tempelhof from "./lib/modules/tempelhof.mjs";
import * as wetter from "./lib/modules/wetter.mjs";
import { berlinDate } from "./lib/render.mjs";
import { berlinParts, berlinToUtc, buildSchedule, tempelhofState } from "./lib/schedule.mjs";
import { moduleBox } from "./lib/screens.mjs";

const { INK, TYPE, RULE, MARGIN, CONTENT, TITLE_SPACE, text } = D;
const OUT = fileURLToPath(new URL("./dist/gallery/", import.meta.url));
mkdirSync(OUT, { recursive: true });
await initRenderer();

const X = MARGIN.x;
const note = (x, y, s) => text(x, y, s, TYPE.caption, { ink: INK.tertiary });
const sections = [];
let n = 0;

/** A specimen: `draw` returns SVG for a 1448 × h canvas. */
function specimen(title, sub, h, draw) {
  const file = `ds-${String(++n).padStart(2, "0")}.png`;
  writeFileSync(`${OUT}${file}`, encodePng(rasterize(svgOpen(W, h) + draw() + "</svg>")));
  sections.push({ title, sub, file, h });
}

/** A module drawn in its screen box (as screens.mjs does), with the box outlined. */
function inBox(b, inner) {
  return (
    `<rect x="${b.x - 0.5}" y="${b.y - 0.5}" width="${b.w + 1}" height="${b.h + 1}" fill="none" stroke="#999" stroke-width="1" stroke-dasharray="6 6"/>` +
    `<g transform="translate(${b.x} ${b.y - TITLE_SPACE})">${inner}</g>`
  );
}

// ---------------- Tokens ----------------

specimen("Type scale", "TYPE tokens: size, weight and ink as the panel shows them", 560, () => {
  let y = 0, svg = "";
  for (const [name, style] of Object.entries(TYPE)) {
    const sample = name === "display" ? "12 h 55" : "Sonnenuntergang 16:02";
    y += Math.max(84, Math.round(style.size * 1.25) + 24);
    svg += note(X, y - style.size * 0.35, `${name}`) + note(X, y - style.size * 0.35 + 34, `${style.size}${style.weight ? " bold" : ""}`);
    svg += text(X + 200, y, sample, style);
  }
  return svg;
});

specimen("Ink and the panel's grays", "INK (primary, secondary, tertiary, paper) — all on the panel's 16 levels (multiples of 17)", 330, () => {
  let svg = "";
  Object.entries(INK).forEach(([name, hex], i) => {
    const x = X + i * 230;
    svg += `<rect x="${x}" y="20" width="200" height="110" fill="${hex}" stroke="#000" stroke-width="2"/>`;
    svg += text(x, 170, name, { size: 32, weight: "bold" }) + note(x, 206, hex);
  });
  for (let g = 0; g < 16; g++) {
    const v = (g * 17).toString(16).padStart(2, "0");
    svg += `<rect x="${X + g * 81}" y="240" width="81" height="60" fill="#${v}${v}${v}"/>`;
  }
  return svg;
});

specimen("Spacing and rules", `MARGIN x ${MARGIN.x} / top ${MARGIN.top} / bottom ${MARGIN.bottom} · CONTENT from y ${CONTENT.top} · RULE hair ${RULE.hair}, thick ${RULE.thick} · grid U = ${D.U}`, 300, () =>
  D.hrule(X, 40, 600) + note(X + 640, 50, `hrule · hair ${RULE.hair}`) +
  D.hrule(X, 110, 600, RULE.thick) + note(X + 640, 120, `hrule · thick ${RULE.thick}`) +
  D.vrule(X + 1100, 20, 260) + note(X + 1130, 150, "vrule") +
  Array.from({ length: 12 }, (_, i) => `<rect x="${X + i * 48}" y="190" width="${D.U}" height="${D.U * (i + 1)}" fill="${INK.tertiary}"/>`).join("") +
  note(X + 640, 250, `multiples of U = ${D.U}`),
);

// ---------------- Primitives ----------------

specimen("Primitives", `label (section titles are ${D.SECTION_TITLES ? "on" : "off"}), underlined, fitSize`, 440, () => {
  const p = D.underlined(X, 120, "Ziel erreicht");
  const u = { svg: text(X + p.w + 80, 166, "Geschlossen", TYPE.strong) };
  const fitted = D.fitSize("Sonnenuntergang 16:02", TYPE.body, 380);
  return (
    D.label(X, 50, "Tempelhofer Feld") + note(X + 420, 50, "label()") +
    p.svg + u.svg + note(X, 240, "underlined() — label style") + note(X + p.w + 80, 240, "strong — Tempelhof state, German headings") +
    `<rect x="${X}" y="300" width="380" height="80" fill="none" stroke="#999" stroke-dasharray="6 6"/>` +
    text(X, 355, "Sonnenuntergang 16:02", { ...TYPE.body, size: fitted }) + note(X + 420, 355, `fitSize() → ${fitted} px to fit 380 px (body is ${TYPE.body.size})`)
  );
});

specimen("Top bar", "topbar({ date, battery }) — every framed screen", 200, () => D.topbar({ date: berlinDate(), battery: 84 }));

specimen("German formatting", "deDateLong · deWeekdayShort · deNumber · deCountdown · deTime", 330, () => {
  const rows = [
    ["deDateLong", D.deDateLong(berlinDate())],
    ["deWeekdayShort", ["2026-11-23", "2026-11-24", "2026-11-28"].map(D.deWeekdayShort).join(" · ")],
    ["deNumber", `${D.deNumber(-3)} · ${D.deNumber(0.7, 1)} · ${D.deNumber(1234)}`],
    ["deCountdown", `${D.deCountdown(45)} · ${D.deCountdown(775)}`],
    ["deTime", D.deTime(new Date().toISOString())],
  ];
  return rows.map(([k, v], i) => note(X, 50 + i * 60, k) + text(X + 300, 50 + i * 60, v, TYPE.body)).join("");
});

specimen("Weather icons", "weatherIcon(code) for each kind, with weatherText(code)", 330, () => {
  const codes = [0, 2, 3, 45, 53, 63, 73, 95];
  return codes.map((c, i) => {
    const x = X + i * 165;
    return D.weatherIcon(c, x, 30, 110) + note(x, 190, `${D.iconKind(c)} (${c})`) + text(x, i % 2 ? 280 : 240, D.weatherText(c), { size: 24 }, { ink: INK.secondary });
  }).join("");
});

// ---------------- Modules ----------------

const now = Date.now();
const p = berlinParts(now);
const at = (h, mi) => berlinToUtc(p.y, p.m, p.d, h, mi);
const events = buildSchedule(now, 1);
const date = berlinDate();
const [weather, programme] = await Promise.all([wetter.fetchWeather(), fetchProgramme()]);
const updated = D.deTime(weather.fetchedAt);
const week = fitness.weekOf(date);
const fit = fitness.parseFitness({
  people: [
    { name: "Matt", goal: 150, days: Object.fromEntries(week.slice(0, 3).map((d, i) => [d, [32, 0, 45][i]])), syncedAt: new Date().toISOString() },
    { name: "Fiona", goal: 150, days: Object.fromEntries(week.slice(0, 3).map((d, i) => [d, [60, 55, 41][i]])), syncedAt: new Date().toISOString() },
  ],
});

const box = (w, h, variant) => ({ x: X, y: 30, w, h, variant });
const moduleSpecimen = (title, b, draw) =>
  specimen(title, `${b.w} × ${b.h} box (dashed), variant "${b.variant}"`, b.h + 60, () => inBox(b, draw(moduleBox(b))));

const half = box(780, 470, "half");
moduleSpecimen("tempelhof · open", half, (mb) => tempelhof.render(mb, tempelhofState(events, at(14, 5))));
moduleSpecimen("tempelhof · closed", half, (mb) => tempelhof.render(mb, tempelhofState(events, at(18, 5))));
moduleSpecimen("wetter · compact", box(476, 844, "compact"), (mb) => wetter.render(mb, weather, { updated }));
moduleSpecimen("wetter · wide", box(1304, 470, "wide"), (mb) => wetter.render(mb, weather, { updated }));
moduleSpecimen("ausdruck · wide", box(1304, 314, "wide"), (mb) => ausdruck.render(mb, ausdruck.entryFor(date)));
moduleSpecimen("ausdruck · full", box(1304, 820, "full"), (mb) => ausdruck.render(mb, ausdruck.entryFor(date)));
moduleSpecimen("praeposition · wide", box(780, 314, "wide"), (mb) => praeposition.render(mb, praeposition.entryFor(date)));
moduleSpecimen("fitness · wide", box(1304, 470, "wide"), (mb) => fitness.render(mb, fit, { date }));
moduleSpecimen("kino · full", box(1304, 844, "full"), (mb) => kino.render(mb, programme, { date, from: "18:00", updated: D.deTime(programme.fetchedAt) }));

writeFileSync(
  `${OUT}design-system.html`,
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design System</title>
<style>
  :root { --bg: #e9e7e3; --ink: #1b1a18; --muted: #6a675f; --card: #fff; --line: #d4d1ca; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #1b1b1d; --ink: #ecebe8; --muted: #a09d97; --card: #26262a; --line: #3a3a3f; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; }
  main { max-width: 1520px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 17px; margin: 0; } p { color: var(--muted); margin: 0 0 20px; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; margin-bottom: 18px; }
  section p { margin: 2px 0 10px; font-size: 14px; }
  img { display: block; width: 100%; height: auto; background: #fff; border: 1px solid var(--line); }
</style>
<main>
  <h1>Kindle design system</h1>
  <p>kindle/lib/design.mjs and the modules, rendered as the panel shows them: Arimo, 16 gray levels, the 1448 px canvas. Section titles are ${D.SECTION_TITLES ? "on" : "off"}.</p>
  ${sections.map((s) => `<section><h2>${s.title}</h2><p>${s.sub}</p><img src="${s.file}" width="1448" height="${s.h}" alt="${s.title}"></section>`).join("\n  ")}
</main>`,
);
console.log(`design system: ${sections.length} specimens → ${OUT}design-system.html`);
