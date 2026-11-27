#!/usr/bin/env node
// ============================================================
// kindle/design.mjs — the Design page, locally (`npm run kindle:design`;
// Phase 8, tiles since Phase 14). The tokens and specimens come from
// kindle/lib/specimens.mjs, which also feeds the admin page's Design tab
// (api/design.mjs); this renders them through the real e-ink pipeline
// into kindle/dist/gallery/design.html.
// ============================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { encodePng, initRenderer, rasterize } from "./lib/eink.mjs";
import { designData, designSpecimens, designTokens } from "./lib/specimens.mjs";

const OUT = fileURLToPath(new URL("./dist/gallery/", import.meta.url));
mkdirSync(OUT, { recursive: true });
await initRenderer();

const data = await designData();
const specimens = designSpecimens(data).map((s, i) => {
  const file = `design-${String(i + 1).padStart(2, "0")}.png`;
  writeFileSync(`${OUT}${file}`, encodePng(rasterize(s.svg)));
  return { ...s, file };
});
const t = designTokens();

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const table = (head, rows) =>
  `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const sw = (hex) => `<span class="sw" style="background:${hex}"></span><code>${hex}</code>`;

const groups = [...new Set(specimens.map((s) => s.group))];
writeFileSync(
  `${OUT}design.html`,
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design</title>
<style>
  :root { --bg: #e9e7e3; --ink: #1b1a18; --muted: #6a675f; --card: #fff; --line: #d4d1ca; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #1b1b1d; --ink: #ecebe8; --muted: #a09d97; --card: #26262a; --line: #3a3a3f; } }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 -apple-system, BlinkMacSystemFont, sans-serif; }
  main { max-width: 1520px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 22px; margin: 0 0 4px; } h2 { font-size: 18px; margin: 28px 0 10px; } h3 { font-size: 16px; margin: 0; }
  p { color: var(--muted); margin: 0 0 16px; }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; margin-bottom: 14px; overflow-x: auto; }
  section p { margin: 2px 0 10px; font-size: 14px; }
  img { display: block; width: 100%; height: auto; background: #fff; border: 1px solid var(--line); }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--muted); font-weight: 600; }
  .sw { display: inline-block; width: 14px; height: 14px; border: 1px solid #888; border-radius: 3px; margin-right: 8px; vertical-align: -2px; }
</style>
<main>
  <h1>Design</h1>
  <p>The Kindle tiles: grid, sizes, type, inks, styles, components and every card — Arimo, 16 gray levels, the ${t.grid.canvas.w} px canvas. Rendered ${esc(data.date)}.</p>
  <h2>Tokens</h2>
  <section><h3>Grid</h3><p>${esc(t.grid.note)}</p>${table(["Cells", "Cell", "Gap", "Margin", "Padding", "Radius"], [[`${t.grid.cols} × ${t.grid.rows}`, `${t.grid.col} × ${t.grid.row}`, t.grid.gap, t.grid.margin, t.grid.pad, t.grid.radius]])}</section>
  <section><h3>Sizes</h3>${table(["Size", "Span", "Tile", "Modules"], t.sizes.map((s) => [s.name, `${s.cols} × ${s.rows}`, `${s.w} × ${s.h}`, s.modules.join(", ")]))}</section>
  <section><h3>Type</h3>${table(["Token", "Size", "Weight", "Used for"], t.type.map((x) => [x.name, x.size + (x.lead ? ` / ${x.lead}` : ""), x.bold ? "bold" : "regular", esc(x.use)]))}</section>
  <section><h3>Inks</h3>${table(["Token", "On paper", "On dark", "Used for"], t.inks.map((x) => [x.name, sw(x.hex), sw(x.dark), esc(x.use)]).concat(t.extraGrays.map((g) => ["—", sw(g.hex), "", esc(g.use)])))}</section>
  <section><h3>Tile styles</h3>${table(["Style", "Used for"], t.tileStyles.map((x) => [x.name, esc(x.use)]))}</section>
  <section><h3>Components</h3>${table(["Component", "Used for"], t.components.map((x) => [`<code>${esc(x.name)}</code>`, esc(x.use)]))}</section>
  ${groups.map((g) => `<h2>${g}</h2>\n  ${specimens.filter((s) => s.group === g).map((s) => `<section><h3>${esc(s.title)}</h3><p>${esc(s.sub)}</p><img src="${s.file}" width="1448" height="${s.h}" alt="${esc(s.title)}"></section>`).join("\n  ")}`).join("\n  ")}
</main>`,
);
console.log(`design: ${specimens.length} specimens → ${OUT}design.html`);
