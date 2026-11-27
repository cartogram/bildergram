// ============================================================
// kindle/lib/specimens.mjs — the Design page's content (Phase 16)
// The tile design as data (designTokens: the grid, sizes, type, inks,
// tile styles, components, each with what it's for) and as specimens
// (designSpecimens: SVG on the 1448 px canvas, rendered through the real
// e-ink pipeline by the caller). Shared by `npm run kindle:design`
// (kindle/design-system.mjs → a local page) and the renderer's
// api/design.mjs (the admin page's Design tab), so the two can't drift.
// ============================================================

import {
  cell, CIRCLE_LABEL, circleLabel, FIRST_CAP, GRID, LIST, PILL, pill, STAT, text, tile,
  TILE_INK, TILE_INK_DARK, TILE_PAD, TILE_SIZES, TILE_TYPE,
} from "./design.mjs";
import { svgOpen, W } from "./eink.mjs";
import * as datum from "./modules/datum.mjs";
import { entryFor, fit, loadEntries as loadAusdruecke } from "./modules/ausdruck.mjs";
import { entryFor as praepositionFor, loadEntries as loadPraepositionen } from "./modules/praeposition.mjs";
import { GAUGE_STEPS } from "./modules/tempelhof.mjs";
import { fetchWeather } from "./modules/wetter.mjs";
import { berlinDate } from "./render.mjs";
import { sampleFitness, sampleProgramme } from "./samples.mjs";
import { berlinParts, berlinToUtc, buildSchedule, tempelhofState } from "./schedule.mjs";
import { boxSvg, moduleBox, moduleSvg, MODULES, SCREENS, tileAt } from "./screens.mjs";

// ------------------------------------------------------------------
// Tokens
// ------------------------------------------------------------------

const TYPE_USE = {
  display: "The one big figure: the temperature. (The day of the month is 88: at 104 it would touch the Akku pill.)",
  heading: "The body size, bold: the expression and the Präposition on the cards; the month.",
  body: "Sentences: the cards' example sentences.",
  label: "A tile's title and field labels (Tempelhof, Im Kino, Matt, Niederschlag), the card titles, the weekday, the Feld lines and countdown.",
  small: "Secondary lines: “heute ab 18:00”, “+ 3 weitere”, the Wörter; the pills and cinema letters (bold).",
};

const INK_USE = {
  ink: "Text and figures; the time still to go; today's ring.",
  muted: "Secondary text: values under labels, “heute ab”, verb forms; the week ring.",
  faint: "Tertiary text: lows, goals (“/ 30”), plurals; the year ring.",
  line: "Ring tracks; the light tile border.",
  paper: "The page and the tiles.",
};

const STYLE_USE = {
  outline: "A black border. The default; not used on the home screen.",
  light: "A light gray border (line ink): Kino, Ausdruck.",
  fill: "A light gray fill (#eeeeee): Wetter, Feld.",
  dark: "Black, modules switch to TILE_INK_DARK: the date, Matt, Fiona.",
  bleed: "No container; a module's graphics may reach into the padding while its text keeps the inset.",
};

/** The design as data, for the Design page: values plus what each is for. */
export function designTokens() {
  return {
    grid: {
      ...GRID,
      cols: 8,
      rows: 4,
      pad: TILE_PAD,
      firstCap: FIRST_CAP,
      canvas: { w: 1448, h: 1072 },
      note: "Tiles span whole cells; content sits TILE_PAD inside. Every tile's first line puts its capitals FIRST_CAP below the content's top; last lines sit on its bottom edge.",
    },
    sizes: Object.entries(TILE_SIZES).map(([name, [cols, rows]]) => {
      const r = cell(0, 0, cols, rows);
      return { name, cols, rows, w: r.w, h: r.h, modules: Object.keys(MODULES).filter((m) => MODULES[m].sizes.includes(name)) };
    }),
    type: [
      ...Object.entries(TILE_TYPE).map(([name, s]) => ({ name, size: s.size, bold: s.weight === "bold", use: TYPE_USE[name] })),
      { name: "list", size: LIST.size, bold: false, lead: LIST.lead, use: "List rows: the Kino listing and the weather's next days (time and day bold)." },
      { name: "stat value", size: STAT.value.size, bold: true, lead: STAT.lead, use: "Values: high/low, precipitation, wind, the exercise legend." },
    ],
    inks: Object.entries(TILE_INK).map(([name, hex]) => ({ name, hex, dark: TILE_INK_DARK[name], use: INK_USE[name] })),
    extraGrays: [
      { hex: "#bbbbbb", use: "The Feld's dots for time passed." },
      { hex: "#eeeeee", use: "The fill tile style." },
    ],
    tileStyles: Object.entries(STYLE_USE).map(([name, use]) => ({ name, use })),
    components: [
      { name: "tile(rect, style)", use: "A tile's background in one of the tile styles; radius " + GRID.radius + "." },
      { name: "pill(x, y, str, opts)", use: `Short bold text (${PILL.size}) in a ${PILL.h}-high rounded bar, light on dark (or inverted): the Feld's times, Akku.` },
      { name: "circleLabel(cx, cy, str)", use: `A letter in a ${CIRCLE_LABEL.d} circle at the pills' text size: a cinema.` },
      { name: "statRow(x, y, w, label, parts)", use: `A label left, a bold value right (${STAT.value.size}, ${STAT.lead} apart): the exercise legend.` },
      { name: "firstBaseline(size)", use: "Where a tile's first line goes, so every tile's top line aligns." },
      { name: "weatherIcon(code, x, y, size)", use: "The WMO weather icons, stroked, on a 100-unit grid." },
      { name: "Feld gauge", use: `${GAUGE_STEPS} dots on a half circle from the last opening/closing to the next, the time still to go in ink; an "n" when open, a "u" when closed. Pasted by the Kindle per step.` },
    ],
    screens: Object.fromEntries(Object.entries(SCREENS).map(([id, s]) => [id, { name: s.name, tiles: s.boxes.map((b) => ({ module: b.module, size: b.size, tone: b.tone ?? "outline", col: b.tile.x, row: b.tile.y })) }])),
  };
}

// ------------------------------------------------------------------
// Specimens
// ------------------------------------------------------------------

/** The data the specimens draw: live weather, sample films and minutes, today's German entries. */
export async function designData(now = Date.now()) {
  const date = berlinDate(now);
  return {
    now,
    date,
    battery: 84,
    wetter: await fetchWeather(),
    kino: { programme: sampleProgramme(date), from: "18:00" },
    ausdruck: entryFor(date),
    praeposition: praepositionFor(date),
    fitness: sampleFitness(date, new Date(now).toISOString()),
  };
}

const X = 24;
const note = (x, y, s) => text(x, y, s, { size: 22, weight: "bold", ink: TILE_INK.faint });

/**
 * Every specimen for `data` (designData): [{ group, title, sub, h, svg }],
 * each svg a complete 1448 × h document.
 */
export function designSpecimens(data) {
  const out = [];
  const specimen = (group, title, sub, h, draw) => out.push({ group, title, sub, h, svg: svgOpen(W, h) + draw() + "</svg>" });
  const p = berlinParts(data.now);
  const at = (h, mi) => berlinToUtc(p.y, p.m, p.d, h, mi);
  const events = buildSchedule(data.now, 1);

  // Grid
  specimen("Grid", "8 × 4 cells", `${GRID.col} × ${GRID.row} cells, ${GRID.gap} gutters, ${GRID.margin} margin; content ${TILE_PAD} inside (the home screen's tiles outlined)`, 1072, () => {
    let svg = "";
    for (let c = 0; c < 8; c++) for (let r = 0; r < 4; r++) {
      const q = cell(c, r);
      svg += `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="#eeeeee"/>`;
    }
    for (const b of SCREENS.home.boxes) {
      svg += tile(b.tile, "outline") + note(b.tile.x + 20, b.tile.y + 40, `${b.module} · ${b.size}${b.variant ? ` · ${b.variant}` : ""}`);
      svg += note(b.tile.x + 20, b.tile.y + 70, `${b.tile.w} × ${b.tile.h}`);
    }
    return svg;
  });

  // Type
  const samples = {
    display: "24 · 2°",
    heading: "sein blaues Wunder erleben",
    body: "Wer an Silvester ohne Reservierung kommt, …",
    label: "Im Kino · Niederschlag · Matt",
    small: "heute ab 18:00 · + 3 weitere · Akku 84 %",
  };
  const rows = [
    ...Object.entries(TILE_TYPE).map(([name, style]) => [name, style, samples[name]]),
    ["list", { size: LIST.size }, "18:30  Das Lehrerzimmer · Sa  −3  0°"],
  ];
  specimen("Type", "Type scale", "TILE_TYPE, plus the list rows (LIST); bold only where marked", 700, () => {
    let y = 0, svg = "";
    for (const [name, style, sample] of rows) {
      y += Math.max(84, Math.round(style.size * 1.15) + 26);
      svg += note(X, y - 30, name) + note(X, y - 4, `${style.size}${style.weight ? " bold" : ""}`);
      svg += text(220, y, sample, style);
    }
    return svg;
  });

  // Inks
  specimen("Color", "Inks", "TILE_INK on paper and TILE_INK_DARK on dark tiles — all on the panel's 16 levels (multiples of 17)", 420, () => {
    let svg = "";
    Object.entries(TILE_INK).forEach(([name, hex], i) => {
      const x = X + i * 280;
      svg += `<rect x="${x}" y="20" width="250" height="100" rx="16" fill="${hex}" stroke="#000" stroke-width="2"/>`;
      svg += text(x, 158, name, TILE_TYPE.label) + note(x, 188, hex);
    });
    svg += `<rect x="${X}" y="236" width="${W - 2 * X}" height="120" rx="32" fill="${TILE_INK_DARK.paper}"/>`;
    Object.entries(TILE_INK_DARK).filter(([k]) => k !== "paper").forEach(([name, hex], i) => {
      const x = X + 40 + i * 330;
      svg += `<circle cx="${x + 18}" cy="296" r="18" fill="${hex}"/>` + text(x + 52, 305, `${name} ${hex}`, { size: 28, weight: "bold", ink: hex === "#444444" ? "#aaaaaa" : hex });
    });
    return svg;
  });

  // Components
  specimen("Components", "Tile styles, pills and letters", "tile(): outline, light, fill, dark, bleed · pill() and circleLabel(), both 32 high", 300, () => {
    const t = (x, style) => tile({ x, y: 20, w: 220, h: 160 }, style) + note(x + 20, 210, style);
    let svg = t(X, "outline") + t(X + 240, "light") + t(X + 480, "fill") + t(X + 720, "dark") +
      `<rect x="${X + 960}" y="20" width="220" height="160" fill="none" stroke="#bbb" stroke-dasharray="6 6"/>` + note(X + 980, 100, "no container") + note(X + 980, 210, "bleed");
    svg += pill(X + 1210, 70, "18:00").svg + circleLabel(X + 1340, 62, "R");
    svg += `<rect x="${X + 1200}" y="100" width="190" height="70" rx="20" fill="#000"/>` + pill(X + 1214, 145, "Akku 84 %", { fill: "#fff", ink: "#000" }).svg;
    return svg;
  });

  // Cards: each [module, cols, rows, opts, data, mode, caption], laid out left to right on the real cells.
  const cards = (title, sub, list) => {
    const rs = Math.max(...list.map((c) => c[2]));
    const h = cell(0, 0, 1, rs).h + 2 * GRID.margin + 34;
    specimen("Cards", title, sub, h, () => {
      let svg = "";
      let col = 0;
      for (const [module, cols, r, opts = {}, d = data, mode = "full", caption = ""] of list) {
        const b = tileAt(module, [col, 0, cols, r], opts);
        const inner = opts.updating ? datum.render(moduleBox(b), { date: d.date, battery: d.battery, updating: true }) : moduleSvg(b, d, mode);
        svg += boxSvg(b, inner);
        if (caption) svg += note(b.tile.x + 8, b.tile.y + b.tile.h + 28, caption);
        col += cols;
      }
      return svg;
    });
  };

  const feld = (ms) => ({ ...data, tempelhof: tempelhofState(events, ms) });
  cards("Datum and Feld", "Small (2 × 1); the Feld is drawn on the Kindle (gauge pieces per state)", [
    ["datum", 2, 1, { tone: "dark" }, data, "full", "datum"],
    ["datum", 2, 1, { tone: "dark", updating: true }, data, "full", "datum · during a check-in"],
    ["tempelhof", 2, 1, { variant: "feld", tone: "fill" }, feld(at(14, 5)), "full", "tempelhof · open"],
    ["tempelhof", 2, 1, { variant: "feld", tone: "fill" }, feld(at(5, 30)), "full", "tempelhof · closed"],
  ]);
  cards("Wetter", "Medium (2 × 2); the three variants", [
    ["wetter", 2, 2, { variant: "mixed", tone: "fill" }, data, "full", "mixed (home)"],
    ["wetter", 2, 2, { variant: "details", tone: "fill" }, data, "full", "details"],
    ["wetter", 2, 2, { variant: "days", tone: "fill" }, data, "full", "days"],
    ["datum", 2, 1, { tone: "dark" }, {}, "fallback", "datum · no connection"],
  ]);
  cards("Im Kino and Präposition", "Large (4 × 2; sample listing); the Präposition uses the Ausdruck card", [
    ["kino", 4, 2, { tone: "light" }, data, "full", "kino"],
    ["praeposition", 4, 2, { tone: "light" }, data, "full", "praeposition"],
  ]);
  const ausdruecke = loadAusdruecke();
  cards("Ausdruck", "Large (4 × 2): two expressions with their Wörter", [
    ["ausdruck", 4, 2, { tone: "light" }, data, "full", "today's"],
    ["ausdruck", 4, 2, { tone: "light" }, { ...data, ausdruck: ausdruecke[3] }, "full", "etwas auf die lange Bank schieben"],
  ]);
  // Medium cards: the longest entry, one that keeps its Wörter, a Präposition that shrinks.
  const mediumBox = moduleBox(tileAt("ausdruck", [0, 0, 2, 2]));
  const praepositionen = loadPraepositionen();
  const asCard = (e) => ({ ausdruck: e.wort, bedeutung: `+ ${e.kasus} · ${e.bedeutung}`, beispiel: e.beispiel });
  const longest = ausdruecke.reduce((a, b) => (b.bedeutung.length + b.ausdruck.length + b.beispiel.length > a.bedeutung.length + a.ausdruck.length + a.beispiel.length ? b : a));
  const withWords = ausdruecke.find((e) => fit(mediumBox, e).words);
  const shrunk = praepositionen.find((e) => fit(mediumBox, asCard(e)).k < 1) ?? praepositionen[0];
  const noFilms = { ...data, kino: { programme: { cinemas: [] }, from: "18:00" } };
  cards("Medium Im Kino and Ausdruck", "Medium (2 × 2): Kino says just heute or morgen, two lines per screening; the Ausdruck keeps its Wörter only when they fit whole", [
    ["kino", 2, 2, { tone: "light" }, data, "full", "kino · medium"],
    ["kino", 2, 2, { tone: "light" }, { ...data, kino: { ...data.kino, day: "morgen" } }, "full", "kino · from 22:00"],
    ["kino", 2, 2, { tone: "light" }, noFilms, "full", "kino · none"],
    ["ausdruck", 2, 2, { tone: "light" }, data, "full", "ausdruck · today's"],
  ]);
  cards("Medium Ausdruck and Präposition", "Medium (2 × 2); the build checks every entry fits", [
    ["ausdruck", 2, 2, { tone: "light" }, { ...data, ausdruck: longest }, "full", "ausdruck · longest"],
    ["ausdruck", 2, 2, { tone: "light" }, { ...data, ausdruck: withWords }, "full", "ausdruck · with Wörter"],
    ["praeposition", 2, 2, { tone: "light" }, data, "full", "praeposition · today's"],
    ["praeposition", 2, 2, { tone: "light" }, { ...data, praeposition: shrunk }, "full", "praeposition · shrunk"],
  ]);
  cards("Bewegung", "Medium (2 × 2), one per person (sample minutes)", [
    ["fitness", 2, 2, { variant: "person", person: "Matt", tone: "dark" }, data, "full", "Matt"],
    ["fitness", 2, 2, { variant: "person", person: "Fiona", tone: "dark" }, data, "full", "Fiona"],
    ["fitness", 2, 2, { variant: "person", person: "Matt", tone: "dark" }, { ...data, fitness: { people: [] } }, "full", "no data yet"],
  ]);
  return out;
}
