// ============================================================
// Module: Bewegung (Phase 12)
// Exercise minutes (Apple Health's green ring) for each person, side by
// side: three progress bars (today, this week, this year) against their
// goals, and a Monday–Sunday strip of daily minutes.
//
// Data: each person's iPhone sends daily exercise minutes to the hub
// (a Shortcuts automation, POST /api/fitness); the hub passes them to
// the renderer with the goals set on the admin page.
//
// Cadence: hourly (a workout should show up within the hour).
// Variant: "wide" (a band across the screen).
// ============================================================

import { deNumber, deTime, deWeekdayShort, firstBaseline, INK, RULE, sectionTitle, stamp, STAT, statRow, text, TILE_INK, TILE_INK_DARK, TILE_TYPE, TITLE_SPACE, TYPE, vrule, width } from "../design.mjs";

export const id = "fitness";
export const cadence = "hourly";

const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const GAP = 32;

/** The Monday–Sunday dates (YYYY-MM-DD) of the week containing `date`. */
export function weekOf(date) {
  const [y, m, d] = date.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const monday = t - ((new Date(t).getUTCDay() + 6) % 7) * 86_400_000;
  return DAYS.map((_, i) => new Date(monday + i * 86_400_000).toISOString().slice(0, 10));
}

/**
 * Validated module data from untrusted JSON (the renderer's `fitness`
 * parameter): { people: [{ name, goals: { day, week, year }, days: { date:
 * minutes } (the week), year (minutes this year), syncedAt }] }.
 */
export function parseFitness(raw) {
  const people = Array.isArray(raw?.people) ? raw.people.slice(0, 3) : [];
  return {
    people: people.map((p) => ({
      name: typeof p?.name === "string" ? p.name.slice(0, 20) : "?",
      goals: Object.fromEntries(
        Object.entries({ day: 30, week: Number.isFinite(p?.goal) ? p.goal : 150, year: 7800 }).map(([k, def]) => {
          const v = p?.goals?.[k];
          return [k, Number.isFinite(v) && v > 0 ? Math.min(100_000, Math.round(v)) : def];
        }),
      ),
      year: Number.isFinite(p?.year) && p.year >= 0 ? Math.round(p.year) : null,
      days: Object.fromEntries(
        Object.entries(p?.days ?? {})
          .filter(([d, v]) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(v) && v >= 0)
          .map(([d, v]) => [d, Math.min(1440, Math.round(v))]),
      ),
      syncedAt: typeof p?.syncedAt === "string" && !Number.isNaN(Date.parse(p.syncedAt)) ? p.syncedAt : null,
    })),
  };
}

/** "Stand 21:40" today, "Stand Mo 21:40" this past week, "Stand 12.11." before; null if never synced. */
function syncNote(syncedAt, date) {
  if (!syncedAt) return null;
  const day = new Date(syncedAt).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
  if (day === date) return `Stand ${deTime(syncedAt)}`;
  const daysAgo = Math.round((Date.parse(date) - Date.parse(day)) / 86_400_000);
  if (daysAgo < 6) return `Stand ${deWeekdayShort(day)} ${deTime(syncedAt)}`;
  return `Stand ${Number(day.slice(8, 10))}.${Number(day.slice(5, 7))}.`;
}

/**
 * A progress bar `w` wide with its top at y: an outline, light grey up to
 * value/goal (capped at 1), the label left and "value / goal min" right,
 * both dark, inside the bar.
 */
const BAR_H = 60;
function bar(y, w, label, value, goal) {
  const fill = Math.round(Math.min(1, Math.max(0, value / goal)) * w);
  const base = y + Math.round(BAR_H / 2 + TYPE.body.size * 0.36);
  let svg = "";
  if (fill > 0) svg += `<rect x="0" y="${y}" width="${fill}" height="${BAR_H}" fill="${INK.fill}"/>`;
  svg += `<rect x="${RULE.hair / 2}" y="${y + RULE.hair / 2}" width="${w - RULE.hair}" height="${BAR_H - RULE.hair}" fill="none" stroke="${INK.primary}" stroke-width="${RULE.hair}"/>`;
  svg += text(18, base, label, TYPE.strong);
  svg += text(w - 18, base, `${deNumber(value)} / ${deNumber(goal)} min`, TYPE.body, { anchor: "end" });
  return svg;
}

/** One person's column, `w` wide, in column-local coordinates. */
function column(person, week, date, w) {
  const total = week.reduce((sum, d) => sum + (person.days[d] ?? 0), 0);
  let svg = "";

  // Name, and when the phone last sent data.
  const name = TYPE.label;
  svg += text(0, 104, person.name, name);
  const used = Math.round(width(person.name, name));
  // The sync note goes right-aligned in what's left: "Stand Mo 07:15", else "Mo 07:15", else nothing.
  const full = syncNote(person.syncedAt, date);
  const small = { ...TYPE.caption, size: Math.round(TYPE.caption.size * 0.75) };
  const note = [full, full?.replace(/^Stand /, "")].find((n) => n && used + 24 + width(n, small) + 18 <= w);
  if (note) svg += stamp(w, 98, note, { anchor: "end", scale: 0.75 }).svg;

  if (!person.syncedAt) {
    svg += text(0, 210, "Noch keine Daten", TYPE.body);
    svg += text(0, 256, "Kurzbefehl einrichten", TYPE.caption);
    return svg;
  }

  // Three goals, each its own bar: today, this week, this year.
  const rows = [
    ["Heute", person.days[date] ?? 0, person.goals.day],
    ["Woche", total, person.goals.week],
    ["Jahr", person.year ?? total, person.goals.year],
  ];
  rows.forEach(([label, value, goal], i) => {
    svg += bar(130 + i * (BAR_H + 16), w, label, value, goal);
  });

  // Monday–Sunday: a bar per day (minutes above), today in bold, days to come grey.
  const slot = w / 7;
  const barW = Math.min(56, Math.round(slot * 0.6));
  const floor = 476;
  const maxH = 52;
  const scale = Math.max(60, ...week.map((d) => person.days[d] ?? 0));
  week.forEach((d, i) => {
    const cx = Math.round(slot * i + slot / 2);
    const min = person.days[d] ?? 0;
    const future = d > date;
    const today = d === date;
    if (!future) {
      const h = min > 0 ? Math.max(6, Math.round((min / scale) * maxH)) : RULE.hair;
      svg += `<rect x="${cx - barW / 2}" y="${floor - h}" width="${barW}" height="${h}" fill="${min > 0 ? INK.primary : INK.tertiary}"/>`;
      if (min > 0) svg += text(cx, floor - h - 10, String(min), TYPE.caption, { anchor: "middle" });
    }
    svg += text(cx, 512, DAYS[i], TYPE.caption, {
      anchor: "middle",
      ink: today ? INK.primary : future ? INK.tertiary : INK.secondary,
    });
  });
  return svg;
}

/** `data` from parseFitness; `date` is the screen's Berlin date (YYYY-MM-DD). */
export function render(box, data, { date }) {
  if (box.variant === "person") return personTile(box, data?.people?.find((p) => p.name === box.person), box.person, date);
  const people = data?.people ?? [];
  const week = weekOf(date);
  let svg = sectionTitle("Bewegung diese Woche");
  if (!people.length) return svg + text(0, 210, "Noch keine Daten", TYPE.body);

  const n = people.length;
  const colW = Math.floor((box.w - (n - 1) * (2 * GAP + RULE.hair)) / n);
  people.forEach((p, i) => {
    const x = i * (colW + 2 * GAP + RULE.hair);
    if (i > 0) svg += vrule(x - GAP - RULE.hair, 72, box.h - 72);
    svg += `<g transform="translate(${x} 0)">${column(p, week, date, colW)}</g>`;
  });
  return svg;
}

// ------------------------------------------------------------------
// A person's tile (Phase 14): three rings and a legend
// ------------------------------------------------------------------

/** The rings, outside in: today, this week (a segment per day), this year — each in an ink of the tile's palette. */
const RINGS = [
  { key: "day", label: "Heute", ink: "ink" },
  { key: "week", label: "Woche", ink: "muted" },
  { key: "year", label: "Jahr", ink: "faint" },
];
const RING_W = 18;
const RING_GAP = 7;

/** Point at `turn` (0 = 12 o'clock, clockwise, 1 = a full circle) on a circle. */
const polar = (cx, cy, r, turn) => [cx + r * Math.sin(turn * 2 * Math.PI), cy - r * Math.cos(turn * 2 * Math.PI)];

/** An arc from turn a to b (0–1, clockwise from 12 o'clock) with round caps. */
function arcPath(cx, cy, r, a, b, ink, w = RING_W) {
  if (b - a >= 0.9999) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ink}" stroke-width="${w}"/>`;
  const [x1, y1] = polar(cx, cy, r, a).map((n) => n.toFixed(1));
  const [x2, y2] = polar(cx, cy, r, b).map((n) => n.toFixed(1));
  return `<path d="M${x1} ${y1} A${r} ${r} 0 ${b - a > 0.5 ? 1 : 0} 1 ${x2} ${y2}" fill="none" stroke="${ink}" stroke-width="${w}" stroke-linecap="round"/>`;
}

/** The paper-coloured dot that marks where a ring's progress starts. */
const startDot = (cx, cy, r, turn, paper) => {
  const [x, y] = polar(cx, cy, r, turn);
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${paper}"/>`;
};

/** `person` from parseFitness (or undefined: no data yet); `date` the screen's date. */
function personTile(box, person, name, date) {
  const top = TITLE_SPACE;
  // Inverted on a dark tile.
  const P = box.tone === "dark" ? TILE_INK_DARK : TILE_INK;
  let svg = text(box.w / 2, top + firstBaseline(TILE_TYPE.label.size), name, { ...TILE_TYPE.label, ink: P.ink }, { anchor: "middle" });
  if (!person?.syncedAt) return svg + text(0, top + 80, "Noch keine Daten", { size: 24, ink: P.muted });

  const week = weekOf(date);
  const weekTotal = week.reduce((sum, d) => sum + (person.days[d] ?? 0), 0);
  const values = { day: person.days[date] ?? 0, week: weekTotal, year: person.year ?? weekTotal };
  const share = (v, goal) => Math.max(0, Math.min(1, v / goal));

  // The rings fill the space between the name and the legend (three stat rows).
  const cx = box.w / 2;
  const ringTop = top + 52;
  const legendTop = box.h - (RINGS.length - 1) * STAT.lead - 28 - 16;
  const outer = Math.min(box.w, legendTop - ringTop) / 2 - RING_W / 2;
  const cy = ringTop + RING_W / 2 + outer;
  RINGS.forEach((ring, i) => {
    const r = outer - i * (RING_W + RING_GAP);
    if (ring.key === "week") {
      // The week's minutes against its goal, a segment per day as long as that
      // day's minutes, end to end from 12 o'clock; no track, no start dot.
      const goal = person.goals.week;
      // Round caps reach RING_W / 2 past each end: leave 6 px between days.
      const gap = (RING_W + 6) / (2 * Math.PI * r);
      let at = 0;
      for (const d of week) {
        const m = person.days[d] ?? 0;
        if (m <= 0 || at >= 1) continue;
        const end = Math.min(1, at + m / goal);
        // A day too short for its gap still shows as a dot.
        const a = at + (at > 0 ? gap / 2 : 0);
        const b = Math.max(a + 0.0005, end - (end < 1 ? gap / 2 : 0));
        svg += arcPath(cx, cy, r, a, b, P[ring.ink]);
        at = end;
      }
    } else {
      const f = share(values[ring.key], person.goals[ring.key]);
      svg += arcPath(cx, cy, r, 0, 1, P.line);
      if (f > 0) svg += arcPath(cx, cy, r, 0, f, P[ring.ink]) + startDot(cx, cy, r, 0, P.paper);
    }
  });

  // The legend, as stat rows: a dot in the ring's ink, the label, the value over the goal.
  RINGS.forEach((ring, i) => {
    const y = box.h - (RINGS.length - 1 - i) * STAT.lead;
    svg += `<circle cx="9" cy="${y - 10}" r="9" fill="${P[ring.ink]}"/>`;
    svg += statRow(0, y, box.w, ring.label, [[deNumber(values[ring.key]), P.ink], [`/ ${deNumber(person.goals[ring.key])}`, P.faint]], { labelX: 30, labelInk: P.ink });
  });
  return svg;
}
