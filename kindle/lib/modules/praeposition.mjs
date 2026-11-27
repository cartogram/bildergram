// ============================================================
// Module: Präposition des Tages (Phase 13)
// One fixed preposition pairing a day (B2): a verb, adjective or noun
// with its preposition and case, the English meaning and an example,
// e.g. „sich freuen auf“ + Akk. — to look forward to.
// Entries live in kindle/data/praepositionen.json and rotate in order.
//
// Cadence: daily (deterministic, no network needed).
// Drawn as the Ausdruck des Tages card.
// ============================================================

import { readFileSync } from "node:fs";
import { entryFor as rotate, render as renderEntry } from "./ausdruck.mjs";

export const id = "praeposition";
export const cadence = "daily";
export const sizes = ["small", "medium", "large"];

export function loadEntries() {
  return JSON.parse(readFileSync(new URL("../../data/praepositionen.json", import.meta.url), "utf8"));
}

/** The entry for a Berlin date (YYYY-MM-DD), rotating like the Ausdruck des Tages. */
export function entryFor(date, entries = loadEntries()) {
  return rotate(date, entries);
}

/** { wort, kasus, bedeutung, beispiel } → the card: "+ Akk. · meaning" as the title, the pairing, the example. */
export function render(box, entry) {
  return renderEntry(box, { ausdruck: entry.wort, bedeutung: `+ ${entry.kasus} · ${entry.bedeutung}`, beispiel: entry.beispiel });
}
