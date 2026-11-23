#!/usr/bin/env node
// ============================================================
// kindle/kino-preview.mjs — render the Yorck listing locally
// (`npm run kino:preview [YYYY-MM-DD]`). Fetches the live
// programme and writes kindle/dist/preview/kino-<date>.png
// (landscape, for viewing) plus the rotated device image.
// ============================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { encodePng, initRenderer, rasterize, rotate } from "./lib/eink.mjs";
import { fetchProgramme, listingSvg, publishedDays } from "./lib/kino.mjs";

const OUT = fileURLToPath(new URL("./dist/preview/", import.meta.url));
mkdirSync(OUT, { recursive: true });

await initRenderer();
const programme = await fetchProgramme();
const days = publishedDays(programme);
const date = process.argv[2] ?? days[0];
console.log(`published days: ${days.join(", ")}`);
for (const c of programme.cinemas) {
  console.log(`  ${c.name}: ${c.sessions.filter((s) => s.date === date).length} screenings on ${date}`);
}

const t0 = performance.now();
const img = rasterize(listingSvg(programme, date, { from: "18:00", updated: "06:00" }));
writeFileSync(`${OUT}kino-${date}.png`, encodePng(img));
writeFileSync(`${OUT}kino-${date}-device.png`, encodePng(rotate(img)));
console.log(`wrote ${OUT}kino-${date}.png in ${(performance.now() - t0).toFixed(0)} ms`);
