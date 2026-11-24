// ============================================================
// Module: Bewegung (Phase 12)
// This week's exercise minutes (Apple Health's green ring) for each
// person, side by side: the total against a weekly goal, a progress
// bar, and a Monday–Sunday strip of daily minutes.
//
// Data: each person's iPhone sends daily exercise minutes to the hub
// (a Shortcuts automation, POST /api/fitness); the hub passes them to
// the renderer with the goals set on the admin page.
//
// Cadence: hourly (a workout should show up within the hour).
// Variant: "wide" (a band across the screen).
// ============================================================

import { INK, RULE, TYPE, deNumber, deTime, deWeekdayShort, label, pill, text, vrule, width } from "../design.mjs";

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
 * parameter): { people: [{ name, goal, days: { date: minutes }, syncedAt }] }.
 */
export function parseFitness(raw) {
  const people = Array.isArray(raw?.people) ? raw.people.slice(0, 3) : [];
  return {
    people: people.map((p) => ({
      name: typeof p?.name === "string" ? p.name.slice(0, 20) : "?",
      goal: Number.isFinite(p?.goal) && p.goal > 0 ? Math.min(10_000, Math.round(p.goal)) : 150,
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

/** One person's column, `w` wide, in column-local coordinates. */
function column(person, week, date, w) {
  const total = week.reduce((sum, d) => sum + (person.days[d] ?? 0), 0);
  const reached = total >= person.goal;
  let svg = "";

  // Name, "Ziel erreicht", and when the phone last sent data.
  const name = { size: TYPE.title.size, weight: "bold" };
  svg += text(0, 104, person.name, name);
  let used = Math.round(width(person.name, name));
  if (reached) {
    const p = pill(used + 20, 104 - 36, "ZIEL ERREICHT", 26);
    svg += p.svg;
    used += 20 + p.w;
  }
  // The sync note goes right-aligned in what's left: "Stand Mo 07:15", else "Mo 07:15", else nothing.
  const full = syncNote(person.syncedAt, date);
  const note = [full, full?.replace(/^Stand /, "")].find((n) => n && used + 24 + width(n, TYPE.caption) <= w);
  if (note) svg += text(w, 104, note, TYPE.caption, { anchor: "end" });

  if (!person.syncedAt) {
    svg += text(0, 210, "Noch keine Daten", TYPE.title, { ink: INK.secondary });
    svg += text(0, 266, "Kurzbefehl einrichten", TYPE.body, { ink: INK.tertiary });
    return svg;
  }

  // Total against the goal.
  const big = deNumber(total);
  svg += text(0, 236, big, TYPE.display);
  svg += text(Math.round(width(big, TYPE.display)) + 6, 236, `/ ${deNumber(person.goal)} min`, TYPE.title, { ink: INK.secondary });

  // Progress bar: an outline, filled up to the goal.
  const barY = 256;
  const barH = 22;
  const fill = Math.round(Math.min(1, total / person.goal) * w);
  svg += `<rect x="${RULE.hair / 2}" y="${barY + RULE.hair / 2}" width="${w - RULE.hair}" height="${barH - RULE.hair}" fill="none" stroke="${INK.primary}" stroke-width="${RULE.hair}"/>`;
  if (fill > 0) svg += `<rect x="0" y="${barY}" width="${fill}" height="${barH}" fill="${INK.primary}"/>`;

  // Monday–Sunday: a bar per day (minutes above), today in bold, days to come grey.
  const slot = w / 7;
  const barW = Math.min(56, Math.round(slot * 0.6));
  const floor = 404;
  const maxH = 80;
  const scale = Math.max(60, ...week.map((d) => person.days[d] ?? 0));
  week.forEach((d, i) => {
    const cx = Math.round(slot * i + slot / 2);
    const min = person.days[d] ?? 0;
    const future = d > date;
    const today = d === date;
    if (!future) {
      const h = min > 0 ? Math.max(6, Math.round((min / scale) * maxH)) : RULE.hair;
      svg += `<rect x="${cx - barW / 2}" y="${floor - h}" width="${barW}" height="${h}" fill="${min > 0 ? INK.primary : INK.tertiary}"/>`;
      if (min > 0) svg += text(cx, floor - h - 10, String(min), TYPE.caption, { anchor: "middle", ink: INK.secondary });
    }
    svg += text(cx, 446, DAYS[i], { size: TYPE.caption.size, weight: today ? "bold" : undefined }, {
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
  let svg = label(0, 30, "Bewegung diese Woche");
  if (!people.length) return svg + text(0, 210, "Noch keine Daten", TYPE.title, { ink: INK.secondary });

  const n = people.length;
  const colW = Math.floor((box.w - (n - 1) * (2 * GAP + RULE.hair)) / n);
  people.forEach((p, i) => {
    const x = i * (colW + 2 * GAP + RULE.hair);
    if (i > 0) svg += vrule(x - GAP - RULE.hair, 72, box.h - 72);
    svg += `<g transform="translate(${x} 0)">${column(p, week, date, colW)}</g>`;
  });
  return svg;
}
