// ============================================================
// Templehof Field open/closed logic — ported from openfeld
// (https://isthefeldopen.com — openfeld/main/src/data/hours.ts + status.ts).
// Temperature is what bildergram shows; the port makes the
// Templehof Field metric self-contained and deterministic.
// ============================================================

export type MonthEntry = {
  open: string;
  close: string;
  lateClose?: string;
  splitDay?: number;
};

export const HOURS: Record<number, MonthEntry> = {
  0: { open: "07:30", close: "17:00" }, // January
  1: { open: "07:00", close: "18:00" }, // February
  2: { open: "06:00", close: "19:00" }, // March
  3: { open: "06:00", close: "20:30" }, // April
  4: { open: "06:00", close: "21:30", lateClose: "22:00", splitDay: 16 }, // May: 9:30pm until 15th, 10pm from 16th
  5: { open: "06:00", close: "23:00" }, // June
  6: { open: "06:00", close: "23:00" }, // July
  7: { open: "06:00", close: "22:30" }, // August
  8: { open: "06:30", close: "21:30" }, // September
  9: { open: "07:00", close: "19:00" }, // October
  10: { open: "07:00", close: "18:00" }, // November
  11: { open: "07:30", close: "17:00" }, // December
};

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function getCloseTime(entry: MonthEntry, day: number): string {
  if (entry.splitDay && day >= entry.splitDay && entry.lateClose) {
    return entry.lateClose;
  }
  return entry.close;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function isOpen(date: Date): boolean {
  const entry = HOURS[date.getMonth()];
  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const openMinutes = timeToMinutes(entry.open);
  const closeMinutes = timeToMinutes(getCloseTime(entry, date.getDate()));
  return currentMinutes >= openMinutes && currentMinutes < closeMinutes;
}

export function getTargetTime(
  date: Date,
  open: boolean,
): { target: Date; time: string } {
  const entry = HOURS[date.getMonth()];
  const target = new Date(date);

  if (open) {
    const closeTime = getCloseTime(entry, date.getDate());
    const [h, m] = closeTime.split(":").map(Number);
    target.setHours(h, m, 0, 0);
    return { target, time: closeTime };
  }

  const currentMinutes = date.getHours() * 60 + date.getMinutes();
  const openMinutes = timeToMinutes(entry.open);

  if (currentMinutes < openMinutes) {
    const [h, m] = entry.open.split(":").map(Number);
    target.setHours(h, m, 0, 0);
    return { target, time: entry.open };
  }

  // After closing — next opening is tomorrow
  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const tomorrowEntry = HOURS[tomorrow.getMonth()];
  const [h, m] = tomorrowEntry.open.split(":").map(Number);
  tomorrow.setHours(h, m, 0, 0);
  return { target: tomorrow, time: tomorrowEntry.open };
}

// ------------------------------------------------------------------
// Status — openfeld's getStatus() + a compact countdown
// ------------------------------------------------------------------

export interface TemplehofStatus {
  /** True when the field is open right now */
  open: boolean;
  /** "HH:MM" — the time it closes, when open */
  closesAt?: string;
  /** "HH:MM" — the next opening time, when closed */
  opensAt?: string;
  /** Compact countdown: "2h 15m" while open, "5h 12m" while closed */
  remaining: string;
}

/** Compact duration for a millisecond delta: "2h 15m", "45m", "0m". */
export function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Port of openfeld's getStatus() — open or closed, with the target
 * time and a countdown to it.
 *
 * bildergram runs on UTC Workers — the countdown is computed against
 * the Berlin wall-clock frame (`berlinTime`), so it reads in wall
 * time the way openfeld reads it on its local-time site.
 */
export function getTemplehofStatus(date: Date = new Date()): TemplehofStatus {
  const berlinTime = new Date(
    date.toLocaleString("en-US", { timeZone: "Europe/Berlin" }),
  );
  const open = isOpen(berlinTime);
  const { target, time } = getTargetTime(berlinTime, open);

  const status: TemplehofStatus = {
    open,
    remaining: formatCountdown(target.getTime() - berlinTime.getTime()),
  };
  if (open) status.closesAt = time;
  else status.opensAt = time;
  return status;
}
