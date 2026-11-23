// ============================================================
// kindle/lib/schedule.mjs — Tempelhof open/close schedule
// Shared by kindle/build.mjs (prebuilt device schedule) and the
// Tempelhof module (gallery / screen state). Times are Berlin wall
// time from kindle/lib/templehof.ts, converted to UTC epochs.
// ============================================================

import { HOURS, getCloseTime } from "./templehof.ts";

const berlin = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit",
});

export function berlinParts(ms) {
  const p = Object.fromEntries(berlin.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute };
}

/** UTC epoch ms for a Berlin wall-clock time (opening hours never fall in a DST gap). */
export function berlinToUtc(y, m, d, h, mi) {
  const want = Date.UTC(y, m - 1, d, h, mi);
  let t = want;
  for (let i = 0; i < 3; i++) {
    const p = berlinParts(t);
    t += want - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  }
  return t;
}

export const hhmm = (s) => s.replace(":", "");

/**
 * Every open/close event from yesterday until `years` from now. Each
 * event carries the background to show *before* it: while the next
 * event is a closing, the field is open, and vice versa.
 */
export function buildSchedule(fromMs, years = 3) {
  const events = [];
  const first = berlinParts(fromMs - 86_400_000);
  const day0 = Date.UTC(first.y, first.m - 1, first.d);
  for (let i = 0; i < years * 366; i++) {
    const day = new Date(day0 + i * 86_400_000);
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    const entry = HOURS[m - 1];
    const open = entry.open;
    const close = getCloseTime(entry, d);
    const hours = `${hhmm(open)}-${hhmm(close)}`;
    const [oh, om] = open.split(":").map(Number);
    const [ch, cm] = close.split(":").map(Number);
    events.push({ t: berlinToUtc(y, m, d, oh, om), kind: "open", label: open, bg: `closed_${hours}` });
    events.push({ t: berlinToUtc(y, m, d, ch, cm), kind: "close", label: close, bg: `open_${hours}` });
  }
  return events.sort((a, b) => a.t - b.t);
}

export function nextEvent(events, ms) {
  let lo = 0, hi = events.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].t > ms) hi = mid; else lo = mid + 1;
  }
  return events[lo].t > ms ? events[lo] : null;
}

/** The device's countdown: minutes to the next event, rounded up. */
export const minutesLeft = (ev, ms) => Math.ceil((ev.t - ms) / 60_000);


/** Tempelhof state at `ms`: open?, target time, minutes left (rounded up), that day's hours. */
export function tempelhofState(events, ms) {
  const ev = nextEvent(events, ms);
  const [, hours] = ev.bg.split("_");
  const [o, c] = hours.split("-").map((x) => `${x.slice(0, 2)}:${x.slice(2)}`);
  return { open: ev.kind === "close", target: ev.label, minutes: minutesLeft(ev, ms), hours: [o, c], bg: ev.bg };
}
