// ============================================================
// Module: Im Kino (Phase 8)
// The evening's screenings at the chosen Yorck cinemas: one
// section per cinema (time, title, formats), balanced over two
// columns, text shrinking until everything fits.
//
// Variant "tonight" (a tile, Phase 14; from 22:00 tomorrow's, "morgen ab
// 18:00" — render.mjs kinoDay): every cinema's screenings in
// one list by time (time, title, the cinema's letter in a circle),
// as many as fit.
//
// Cadence: daily (rendered at check-in for the slot's date).
// Data: kindle/lib/kino.mjs → fetchProgramme(slugs).
// ============================================================

import { CIRCLE_LABEL, circleLabel, firstBaseline, sectionTitle, text, TILE_TYPE, TITLE_SPACE, TYPE, width } from "../design.mjs";
import { wrap } from "../eink.mjs";

export const id = "kino";
export const cadence = "daily";

const GUTTER = 64;

/** One cinema section at body size `size`; returns { h, svg } in section coordinates. */
function section(cinema, rows, size, colW) {
  const line = Math.round(size * 1.22);
  const timeW = width("00:00", { size, weight: "bold" }) + size * 0.55;
  // Formats (OmU, OV) are captions, scaled with the listing.
  const fmtSize = Math.round((size * TYPE.caption.size) / TYPE.body.size);
  // The cinema name is a label at the listing's size.
  const head = size;
  let y = head;
  let svg = text(0, y, cinema.name, { ...TYPE.label, size: head });
  y += Math.round(size * 0.6);
  for (const s of rows) {
    const title = wrap(s.title, size, colW - timeW, 2);
    const fmt = (s.formats ?? []).join(" · ");
    const top = y;
    svg += text(0, top + line, s.time, { ...TYPE.body, size });
    title.forEach((t, i) => {
      svg += text(timeW, top + line * (i + 1), t, { size });
    });
    if (fmt) svg += text(0, top + line * 2 - Math.round(size * 0.12), fmt, { ...TYPE.caption, size: fmtSize });
    y = top + Math.max(title.length, fmt ? 2 : 1) * line + Math.round(size * 0.32);
  }
  return { h: y, svg };
}

function columns(cinemas, size, box, top) {
  const colW = (box.w - GUTTER) / 2;
  const avail = box.h - top - 56;
  const cols = [{ h: 0, svg: "" }, { h: 0, svg: "" }];
  let fits = true;
  for (const c of [...cinemas].sort((a, b) => b.rows.length - a.rows.length)) {
    const col = cols[0].h <= cols[1].h ? cols[0] : cols[1];
    const room = avail - col.h;
    let rows = c.rows;
    let sec = section(c, rows, size, colW);
    while (sec.h > room && rows.length > 1) {
      fits = false;
      rows = rows.slice(0, -1);
      sec = section(c, [...rows, { time: "", title: `+ ${c.rows.length - rows.length} weitere`, formats: [] }], size, colW);
    }
    if (sec.h > room) fits = false;
    const x = col === cols[0] ? 0 : colW + GUTTER;
    col.svg += `<g transform="translate(${x} ${top + col.h})">${sec.svg}</g>`;
    col.h += sec.h + Math.round(size * 0.9);
  }
  return { fits, svg: cols[0].svg + cols[1].svg };
}

/**
 * The listing for `date` (screenings at or after `from`) inside `box`.
 * `titleSize` enlarges the "IM KINO" label when the module is the
 * whole screen (no top bar).
 */
export function render(box, programme, { date, day = "heute", from = "18:00", titleSize } = {}) {
  if (box.variant === "tonight") return renderTonight(box, programme, { date, day, from });
  const cinemas = programme.cinemas
    .map((c) => ({ ...c, rows: c.sessions.filter((s) => s.date === date && s.time >= from) }))
    .filter((c) => c.rows.length);

  let svg = titleSize ? text(0, titleSize, "IM KINO", { ...TYPE.caption, size: titleSize, spacing: 6 }) : sectionTitle("Im Kino");
  const top = titleSize ? titleSize + 64 : 64;
  if (!cinemas.length) {
    svg += text(0, top + 120, "Heute keine Vorstellungen", TYPE.body);
  } else {
    let placed;
    for (const size of [40, 36, 32, 28]) {
      placed = columns(cinemas, size, box, top);
      if (placed.fits) break;
    }
    svg += placed.svg;
  }
  return svg;
}

/** The tile: "Im Kino" and the evening's screenings by time, one line each. */
function renderTonight(box, programme, { date, day, from }) {
  const top = TITLE_SPACE;
  const size = 30;
  const rowH = 50;
  const rows = programme.cinemas
    .flatMap((c) => c.sessions.filter((s) => s.date === date && s.time >= from).map((s) => ({ ...s, cinema: c.name })))
    .sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
  const y1 = top + firstBaseline(TILE_TYPE.label.size);
  let svg = text(0, y1, "Im Kino", TILE_TYPE.label) + text(box.w, y1, `${day} ab ${from}`, TYPE.caption, { anchor: "end" });
  if (!rows.length) return svg + text(0, top + 110, "Heute keine Vorstellungen", { size });
  const timeW = Math.ceil(width("00:00", { size, weight: "bold" })) + 18;
  const titleW = box.w - timeW - CIRCLE_LABEL.d - 20;
  const letters = cinemaLetters(programme.cinemas.map((c) => c.name));
  // Leave room for "+ n weitere" when not everything fits.
  // Rows from baseline top + 100 down to the bottom; when some are left out,
  // the last row's place goes to "+ n weitere" (on the bottom line).
  let fit = Math.floor((box.h - (top + 94)) / rowH) + 1;
  if (fit < rows.length) fit = Math.floor((box.h - 44 - (top + 94)) / rowH) + 1;
  rows.slice(0, fit).forEach((r, i) => {
    const y = top + 94 + i * rowH;
    svg += text(0, y, r.time, { size, weight: "bold" });
    svg += text(timeW, y, wrap(r.title, size, titleW, 1)[0], { size });
    // The cinema's initials in a circle, centred on the row's lowercase letters.
    svg += circleLabel(box.w - CIRCLE_LABEL.d / 2, y - Math.round(size * 0.36), letters.get(r.cinema));
  });
  if (fit < rows.length) svg += text(0, box.h, `+ ${rows.length - fit} weitere`, TYPE.caption);
  return svg;
}

/** "Neues Off" → "NO", "Rollberg" → "R". */
const initials = (name) => name.split(/[\s-]+/).filter(Boolean).map((w) => w[0].toUpperCase()).join("").slice(0, 2);

/** Each cinema's label: its first letter ("Neues Off" → "N"), or its two initials when the first letter is shared. */
function cinemaLetters(names) {
  const first = (n) => n.trim()[0].toUpperCase();
  return new Map(names.map((n) => [n, names.filter((m) => first(m) === first(n)).length > 1 ? initials(n) : first(n)]));
}
