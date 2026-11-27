// ============================================================
// kindle/lib/samples.mjs — sample data for design review (Phase 14),
// shared by the gallery and the design system page: a cinema
// listing (yorck.de drops screenings once they start) and two people's
// exercise minutes.
// ============================================================

import { parseFitness, weekOf } from "./modules/fitness.mjs";

/** A fixed evening at three cinemas on `date`, with language versions (OmU, OmeU, OV) like yorck.de's. */
export const sampleProgramme = (date) => ({
  cinemas: [
    ["Rollberg", [["18:00", "Perfect Days", "OmU"], ["18:45", "Anatomie eines Falls", "OmeU"], ["20:30", "The Zone of Interest", "OmU"], ["21:15", "Past Lives", "OV"]]],
    ["Passage", [["18:30", "Das Lehrerzimmer"], ["19:00", "Poor Things", "OmU"], ["20:45", "Oppenheimer", "OV"]]],
    ["Neues Off", [["19:15", "Die Theorie von Allem"], ["21:00", "Aki Kaurismäki: Fallende Blätter", "OmU"], ["22:30", "Godzilla Minus One", "OmeU"]]],
  ].map(([name, rows]) => ({
    slug: name.toLowerCase().replace(" ", "-"),
    name,
    sessions: rows.map(([time, title, format]) => ({ date, time, title, film: null, formats: format ? [format] : [] })),
  })),
});

/** Matt and Fiona's minutes for the week of `date` (up to that day), synced at `syncedAt` (ISO). */
export function sampleFitness(date, syncedAt) {
  const week = weekOf(date);
  const upTo = (mins) => Object.fromEntries(week.map((d, i) => [d, mins[i]]).filter(([d]) => d <= date));
  return parseFitness({
    people: [
      { name: "Matt", goal: 150, days: upTo([32, 0, 45, 18, 60, 0, 25]), year: 5940, syncedAt },
      { name: "Fiona", goal: 150, days: upTo([55, 40, 0, 62, 30, 75, 20]), year: 7120, syncedAt },
    ],
  });
}
