// ============================================================
// Module: Zeit (Phase 17)
// Where we are in the year: the day of the year and the (ISO) calendar
// week, in two centred columns, each a title over its number. A small
// card. (lifeWeek() counts the week of a life from a birthday, for later.)
//
// Cadence: daily (deterministic, no network needed).
// ============================================================

import { firstBaseline, text, TILE_TYPE } from "../design.mjs";

export const id = "zeit";
export const cadence = "daily";
export const sizes = ["small"];

const DAY = 86_400_000;
const utc = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** The day of the year (1 = 1 January) and the year's length, for YYYY-MM-DD. */
export function dayOfYear(date) {
  const y = Number(date.slice(0, 4));
  const days = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / DAY;
  return { day: (utc(date) - Date.UTC(y, 0, 1)) / DAY + 1, days };
}

/** The ISO 8601 week of a UTC midnight: { year, week } (Monday first; week 1 holds the year's first Thursday). */
function weekOf(ms) {
  const t = new Date(ms);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3); // that week's Thursday
  const year = t.getUTCFullYear();
  return { year, week: 1 + Math.floor((t - Date.UTC(year, 0, 1)) / DAY / 7) };
}

/** The ISO week for YYYY-MM-DD and how many weeks its (ISO) year has (28 December is always in the last). */
export function isoWeek(date) {
  const { year, week } = weekOf(utc(date));
  return { week, weeks: weekOf(Date.UTC(year, 11, 28)).week };
}

/** The week of a life on `date`, counting the birthday's week as week 1. */
export const lifeWeek = (date, born) => Math.floor((utc(date) - utc(born)) / DAY / 7) + 1;

/**
 * `date` (YYYY-MM-DD). Two columns, each centred: its title at the top
 * (label, like a card's title) and its number below (figure), centred in
 * the space under the titles.
 */
export function render(box, { date }) {
  if (!date) return "";
  const cols = [["Tag", String(dayOfYear(date).day)], ["Woche", String(isoWeek(date).week)]];
  const col = box.w / 2;
  const big = TILE_TYPE.figure;
  const titleY = firstBaseline(TILE_TYPE.label.size);
  // The numbers' capitals centred between the titles and the bottom edge.
  const cap = Math.round(big.size * 0.716);
  const numY = Math.round(titleY + (box.h - titleY - cap) / 2 + cap);
  return cols.map(([label, n], i) => {
    const cx = col * i + col / 2;
    return text(cx, titleY, label, TILE_TYPE.label, { anchor: "middle" }) + text(cx, numY, n, big, { anchor: "middle" });
  }).join("");
}
