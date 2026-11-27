// ============================================================
// Module: Wetter (Phase 8; tiles since Phase 14)
// The temperature now with today's high/low, today's precipitation and
// wind, and the next days' high/low, from Open-Meteo (free, no key; DWD
// ICON model for Germany).
//
// Cadence: hourly while on screen (rendered at check-in).
// Variants (2 × 2 tiles sharing a header: now, today's high/low):
// "details" (precipitation, wind), "days" (the next days) and "mixed"
// (both, as many days as fit).
// ============================================================

import { deNumber, deWeekdayShort, firstBaseline, LIST, STAT, text, TILE_INK, TILE_TYPE, weatherIcon, width } from "../design.mjs";

export const id = "wetter";
export const cadence = "hourly";
export const sizes = ["medium"];

/** Tempelhofer Feld. */
export const DEFAULT_LOCATION = { lat: 52.473, lon: 13.401 };

/**
 * Normalized weather:
 * { fetchedAt, now: { temp, code, wind }, sunset: "16:03",
 *   days: [{ date, code, max, min, pop, mm }] × 4 (today first) }
 */
export async function fetchWeather({ lat, lon } = DEFAULT_LOCATION) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: "Europe/Berlin",
    forecast_days: "4",
    current: "temperature_2m,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunset",
  }).toString();
  const res = await fetch(url, { headers: { "User-Agent": "bildergram/1.0 (personal e-ink display)" } });
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}`);
  return parseWeather(await res.json());
}

export function parseWeather(j) {
  const d = j.daily;
  return {
    fetchedAt: new Date().toISOString(),
    now: { temp: j.current.temperature_2m, code: j.current.weather_code, wind: j.current.wind_speed_10m },
    sunset: d.sunset[0].slice(11, 16),
    days: d.time.slice(0, 4).map((date, i) => ({
      date,
      code: d.weather_code[i],
      max: d.temperature_2m_max[i],
      min: d.temperature_2m_min[i],
      pop: d.precipitation_probability_max[i],
      mm: d.precipitation_sum[i],
    })),
  };
}

// `|| 0` turns -0 (e.g. -0.4 rounded) into 0, so it isn't shown as "−0°".
const deg = (t) => `${deNumber(Math.round(t) || 0)}°`;

/** A small up or down arrow, `h` tall, its foot or tip on baseline y, left edge at x. */
function arrow(x, y, h, up, ink) {
  const w = Math.round(h * 0.6);
  const cx = x + w / 2;
  const [tip, tail] = up ? [y - h, y] : [y, y - h];
  const head = up ? tip + w / 2 : tip - w / 2;
  return `<path d="M${cx} ${tail} V${tip} M${x} ${head} L${cx} ${tip} L${x + w} ${head}" fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** Today's precipitation, short: the amount, else the chance, else "Trocken". */
function precipToday(d) {
  if (d.mm >= 0.1) return `${deNumber(d.mm, d.mm < 10 ? 1 : 0)} mm`;
  return (d.pop ?? 0) >= 20 ? `${d.pop} %` : "Trocken";
}

/** The top of every variant: the place, an icon, the temperature large, today's high/low beside it. */
function header(box, w) {
  const today = w.days[0];
  // High/low right-aligned in the values' style, the arrows in one column left of the widest ("−10°").
  const arrowX = box.w - Math.ceil(width("−10°", STAT.value)) - 24;
  const hilo = (y, t, up, ink) => arrow(arrowX, y, 22, up, ink) + text(box.w, y, deg(t), { ...STAT.value, ink }, { anchor: "end" });
  return (
    text(0, firstBaseline(TILE_TYPE.label.size), "Tempelhof", TILE_TYPE.label) +
    weatherIcon(w.now.code, box.w - 58, -6, 58) +
    text(-4, 140, deg(w.now.temp), TILE_TYPE.display) +
    hilo(100, today.max, true, TILE_INK.ink) +
    hilo(100 + STAT.lead, today.min, false, TILE_INK.faint)
  );
}

/**
 * Day rows (icon, day, low, high), the last one's baseline at `bottom`, as
 * many as fit below `minY`. The temperatures sit in fixed columns (lows
 * right-aligned in one, highs in the other), so they line up row to row.
 */
function dayRows(box, w, bottom, minY) {
  // In the list rows' size (design.mjs LIST, like the Kino listing): the day and the temperatures bold.
  const days = w.days.slice(1);
  const n = Math.min(days.length, Math.floor((bottom - minY) / LIST.lead) + 1);
  const bold = { size: LIST.size, weight: "bold" };
  const highW = Math.ceil(width("−10°", bold)) + 14;
  const icon = 46;
  let svg = "";
  days.slice(0, n).forEach((d, i) => {
    const y = bottom - (n - 1 - i) * LIST.lead;
    svg += weatherIcon(d.code, -2, y - 38, icon);
    svg += text(icon + 12, y, deWeekdayShort(d.date), bold);
    svg += text(box.w - highW, y, deNumber(Math.round(d.min) || 0), { ...bold, ink: TILE_INK.faint }, { anchor: "end" });
    svg += text(box.w, y, deg(d.max), { ...bold, ink: TILE_INK.ink }, { anchor: "end" });
  });
  return svg;
}

/**
 * A 2 × 2 tile, all variants with the same header:
 *   "details" — precipitation and wind, each label over its value;
 *   "days"    — the next days, at the bottom;
 *   "mixed"   — both: the conditions under the header, the days anchored
 *               to the bottom, the space between them.
 */
export function render(box, w) {
  const statsY = 200;
  const VAL_GAP = 32;
  const stat = (y, label, value) => text(0, y, label, TILE_TYPE.label) + text(0, y + VAL_GAP, value, { ...STAT.value, ink: TILE_INK.muted });
  const stats =
    stat(statsY, "Niederschlag", precipToday(w.days[0])) +
    stat(statsY + VAL_GAP + STAT.lead + 8, "Wind", `${deNumber(Math.round(w.now.wind))} km/h`);
  const statsEnd = statsY + 2 * VAL_GAP + STAT.lead + 8;
  let svg = header(box, w);
  if (box.variant === "details") svg += stats;
  else if (box.variant === "days") svg += dayRows(box, w, box.h, statsY);
  else svg += stats + dayRows(box, w, box.h, statsEnd + 40);
  return svg;
}
