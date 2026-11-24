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

import { deNumber, deTime, deWeekdayShort, INK, RULE, sectionTitle, stamp, text, TYPE, vrule, width } from "../design.mjs";

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
