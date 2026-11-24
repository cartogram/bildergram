// ============================================================
// kindle/samples.mjs — sample data for design review (Phase 14),
// shared by the gallery and the design system page: a cinema
// listing (yorck.de drops screenings once they start), an Ausdruck
// with mock Wörter (the real ones are not written yet) and two
// people's exercise minutes.
// ============================================================

import { parseFitness, weekOf } from "./lib/modules/fitness.mjs";

/** A fixed evening at three cinemas on `date`. */
export const sampleProgramme = (date) => ({
  cinemas: [
    ["Rollberg", [["18:00", "Perfect Days"], ["18:45", "Anatomie eines Falls"], ["20:30", "The Zone of Interest"], ["21:15", "Past Lives"]]],
    ["Passage", [["18:30", "Das Lehrerzimmer"], ["19:00", "Poor Things"], ["20:45", "Oppenheimer"]]],
    ["Neues Off", [["19:15", "Die Theorie von Allem"], ["21:00", "Aki Kaurismäki: Fallende Blätter"], ["22:30", "Godzilla Minus One"]]],
  ].map(([name, rows]) => ({
    slug: name.toLowerCase().replace(" ", "-"),
    name,
    sessions: rows.map(([time, title]) => ({ date, time, title, film: null, formats: [] })),
  })),
});

/** An Ausdruck with mock Wörter. */
export const mockAusdruck = {
  ausdruck: "sein blaues Wunder erleben",
  bedeutung: "to be in for a nasty surprise",
  beispiel: "Wer an Silvester ohne Reservierung kommt, wird sein blaues Wunder erleben.",
  woerter: [
    { artikel: "das", wort: "Silvester", plural: "–" },
    { artikel: "die", wort: "Reservierung", plural: "-en" },
    { artikel: "das", wort: "Wunder", plural: "–" },
    { verb: "erleben", formen: "erlebte · hat erlebt" },
  ],
};

/** A second Ausdruck with mock Wörter: a plural with an umlaut (written out) and a strong verb. */
export const mockAusdruck2 = {
  ausdruck: "etwas auf die lange Bank schieben",
  bedeutung: "to put something off",
  beispiel: "Die Steuererklärung habe ich schon viel zu lange auf die lange Bank geschoben.",
  woerter: [
    { artikel: "die", wort: "Steuererklärung", plural: "-en" },
    { artikel: "die", wort: "Bank", plural: "Bänke" },
    { verb: "schieben", formen: "schob · hat geschoben" },
  ],
};

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
