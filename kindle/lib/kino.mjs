// ============================================================
// kindle/lib/kino.mjs — Yorck cinema listing for the Kindle
// Used by the Vercel function api/kino.mjs and the local preview
// (kindle/kino-preview.mjs).
//
// Data: each yorck.de cinema page (/kinos/<slug>) embeds its whole
// programme (~100 KB) as Next.js JSON: films with their sessions
// (start time with Berlin offset, formats like OmU/OV/OmeU). The
// programme is published a few days ahead; the new cinema week
// (Thursday) appears early in the week.
// ============================================================

import { H, W, bold, escapeXml, svgOpen, textWidth, wrap } from "./eink.mjs";

export const DEFAULT_CINEMAS = ["rollberg", "passage", "neues-off"];
const USER_AGENT = "bildergram/1.0 (personal e-ink cinema listing; once a day)";

/** A day counts as published once the chosen cinemas have this many screenings on it. */
const MIN_SCREENINGS_PER_DAY = 5;

// ------------------------------------------------------------------
// Fetch + parse
// ------------------------------------------------------------------

function nextData(html, url) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`no __NEXT_DATA__ in ${url}`);
  return JSON.parse(m[1]);
}

/** One cinema's programme: { slug, name, sessions: [{ date, time, title, formats, runtime }] } */
export function parseCinemaPage(html, slug) {
  const pp = nextData(html, slug).props?.pageProps;
  const name = (pp?.cinema?.fields?.name ?? slug).trim();
  const sessions = [];
  for (const film of pp?.filmsSpecials ?? []) {
    const f = film.fields ?? {};
    for (const s of f.sessions ?? []) {
      const sf = s.fields ?? {};
      // startTime carries the Berlin offset, so its text is Berlin wall time.
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(sf.startTime ?? "");
      if (!m) continue;
      const at = sf.cinema?.fields?.name?.trim();
      if (at && at !== name) continue;
      sessions.push({ date: m[1], time: m[2], title: f.title ?? "?", formats: sf.formats ?? [], runtime: f.runtime });
    }
  }
  sessions.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.title.localeCompare(b.title));
  return { slug, name, sessions };
}

export async function fetchProgramme(slugs = DEFAULT_CINEMAS) {
  const cinemas = await Promise.all(
    slugs.map(async (slug) => {
      const url = `https://www.yorck.de/kinos/${encodeURIComponent(slug)}`;
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`${url} returned ${res.status}`);
      return parseCinemaPage(await res.text(), slug);
    }),
  );
  return { cinemas, fetchedAt: new Date().toISOString() };
}

/** Berlin dates for which the programme is out (enough screenings across the cinemas). */
export function publishedDays(programme) {
  const count = new Map();
  for (const c of programme.cinemas) for (const s of c.sessions) count.set(s.date, (count.get(s.date) ?? 0) + 1);
  return [...count].filter(([, n]) => n >= MIN_SCREENINGS_PER_DAY).map(([d]) => d).sort();
}

// ------------------------------------------------------------------
// Layout (landscape W × H, drawn as SVG)
// ------------------------------------------------------------------

const M = 80; // side margin, same as the Tempelhof screen
const TOP = 200; // first content line
const BOTTOM = H - 100; // content must end above the footer
const GUTTER = 64;
const COL_W = (W - 2 * M - GUTTER) / 2;

/** Screen title: "At the cinema" in German. */
export const TITLE = "IM KINO";

/** Lay out one cinema section at a given text size; returns its height and SVG (relative to 0,0). */
function section(cinema, rows, size) {
  const line = Math.round(size * 1.2);
  const timeW = textWidth("00:00", size) + size * 0.6;
  const titleW = COL_W - timeW;
  const fmtSize = Math.round(size * 0.7);
  let y = Math.round(size * 1.1);
  let svg = `<text x="0" y="${y}" font-size="${Math.round(size * 1.1)}" ${bold(size * 1.1)}>${escapeXml(cinema.name)}</text>`;
  y += Math.round(size * 0.5);
  for (const s of rows) {
    const title = wrap(s.title, size, titleW, 2);
    const fmt = s.formats.join(" · ");
    const top = y;
    y += line;
    svg += `<text x="0" y="${y}" font-size="${size}" ${bold(size)}>${s.time}</text>`;
    title.forEach((t, i) => {
      svg += `<text x="${timeW}" y="${y + i * line}" font-size="${size}">${escapeXml(t)}</text>`;
    });
    const lines = Math.max(title.length, fmt ? 2 : 1);
    if (fmt) {
      svg += `<text x="0" y="${top + line * 2 - Math.round(size * 0.15)}" font-size="${fmtSize}" fill="#555">${escapeXml(fmt)}</text>`;
    }
    y = top + lines * line + Math.round(size * 0.35);
  }
  return { h: y, svg };
}

/**
 * The evening listing for `date`: screenings starting at or after `from`
 * (HH:MM), one section per cinema, balanced over two columns. The text
 * shrinks until everything fits; if even the smallest size overflows,
 * the longest sections are cut with a "+ N more" line.
 */
export function listingSvg(programme, date, { from = "18:00", updated } = {}) {
  const cinemas = programme.cinemas
    .map((c) => ({ ...c, rows: c.sessions.filter((s) => s.date === date && s.time >= from) }))
    .filter((c) => c.rows.length);

  let body = "";
  if (!cinemas.length) {
    body = `<text x="${W / 2}" y="${H / 2}" font-size="64" text-anchor="middle" fill="#444">No screenings tonight</text>`;
  } else {
    let placed;
    for (const size of [44, 40, 36, 32, 28]) {
      placed = layoutColumns(cinemas, size);
      if (placed.fits) break;
    }
    body = placed.svg;
  }

  // Only the title, the listing and when it was fetched.
  return `${svgOpen(W, H)}
    <text x="${M}" y="118" font-size="46" letter-spacing="6" fill="#444">${TITLE}</text>
    ${body}
    ${updated ? `<text x="${M}" y="${H - 44}" font-size="30" fill="#555">Last updated ${escapeXml(updated)}</text>` : ""}
  </svg>`;
}

function layoutColumns(cinemas, size) {
  const avail = BOTTOM - TOP;
  // Longest sections first, each into the currently shorter column.
  const cols = [{ h: 0, svg: "" }, { h: 0, svg: "" }];
  let fits = true;
  const ordered = [...cinemas].sort((a, b) => b.rows.length - a.rows.length);
  for (const c of ordered) {
    const col = cols[0].h <= cols[1].h ? cols[0] : cols[1];
    const room = avail - col.h;
    let rows = c.rows;
    let sec = section(c, rows, size);
    while (sec.h > room && rows.length > 1) {
      fits = false;
      rows = rows.slice(0, -1);
      sec = section({ ...c, name: c.name }, [...rows, { time: "", title: `+ ${c.rows.length - rows.length} more`, formats: [] }], size);
    }
    if (sec.h > room) fits = false;
    const x = M + (col === cols[0] ? 0 : COL_W + GUTTER);
    col.svg += `<g transform="translate(${x} ${TOP + col.h})">${sec.svg}</g>`;
    col.h += sec.h + Math.round(size * 0.9);
  }
  return { fits, svg: cols[0].svg + cols[1].svg };
}
