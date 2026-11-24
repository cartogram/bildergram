// ============================================================
// Module: Im Kino (Phase 8)
// The evening's screenings at the chosen Yorck cinemas: one
// section per cinema (time, title, formats), balanced over two
// columns, text shrinking until everything fits.
//
// Cadence: daily (rendered at check-in for the slot's date).
// Data: kindle/lib/kino.mjs → fetchProgramme(slugs).
// ============================================================

import { sectionTitle, stamp, text, TYPE, width } from "../design.mjs";
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
export function render(box, programme, { date, from = "18:00", updated, titleSize } = {}) {
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
