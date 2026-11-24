// ============================================================
// Module: Wetter (Phase 8)
// Now (temperature, condition, wind), today's sunset, and three
// days of high/low and precipitation, from Open-Meteo (free, no
// key; DWD ICON model for Germany).
//
// Cadence: hourly while on screen (rendered at check-in).
// Variants: "compact" (narrow column) and "wide" (full width).
// ============================================================

import { deNumber, detailIcon, deWeekdayShort, fitSize, hrule, INK, sectionTitle, stamp, text, TYPE, weatherIcon, weatherText } from "../design.mjs";

export const id = "wetter";
export const cadence = "hourly";

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
const dayName = (date, i) => (i === 0 ? "Heute" : i === 1 ? "Morgen" : deWeekdayShort(date));

/** "60 %" plus "· 1,2 mm" when there is measurable precipitation. */
function precip(day) {
  const mm = day.mm >= 0.1 ? ` · ${deNumber(day.mm, day.mm < 10 ? 1 : 0)} mm` : "";
  return `${day.pop ?? 0} %${mm}`;
}

export function render(box, w, { updated } = {}) {
  return box.variant === "wide" ? renderWide(box, w) : renderCompact(box, w, updated);
}

/** Narrow column (e.g. beside Tempelhof). */
function renderCompact(box, w, updated) {
  let svg = sectionTitle("Wetter");
  // Now: icon + temperature
  svg += weatherIcon(w.now.code, -6, 60, 128);
  svg += text(136, 176, deg(w.now.temp), TYPE.display);
  let y = 248;
  const cond = weatherText(w.now.code);
  svg += text(0, y, cond, { ...TYPE.body, size: fitSize(cond, TYPE.body, box.w) });
  y += 56;
  svg += detail("wind", 0, y, `${deNumber(Math.round(w.now.wind))} km/h`);
  y += 52;
  svg += detail("sunset", 0, y, w.sunset);
  y += 44;
  svg += hrule(0, y, box.w);
  y += 72;
  // Three days
  w.days.slice(0, 3).forEach((d, i) => {
    svg += text(0, y, dayName(d.date, i), TYPE.strong);
    svg += weatherIcon(d.code, box.w - 64, y - 46, 60);
    svg += text(0, y + 50, `${deg(d.max)} / ${deg(d.min)}`, TYPE.body);
    svg += text(box.w - 76, y + 50, precip(d), TYPE.caption, { anchor: "end" });
    y += 130;
  });
  if (updated) svg += stamp(0, box.h - 8, `Stand ${updated}`).svg;
  return svg;
}

/** A detail line: a small icon, then the value in body text. */
function detail(kind, x, y, value) {
  const size = 44;
  return detailIcon(kind, x, y - 36, size) + text(x + size + 16, y, value, TYPE.body);
}

/** Full width: now on the left, three day columns on the right. */
function renderWide(box, w) {
  let svg = sectionTitle("Wetter");
  const leftW = Math.round(box.w * 0.38);
  // Now: the icon with the temperature centred under it; beside them a
  // column with the conditions, wind and sunset.
  const iconSize = 150;
  // Baselines line up with the forecast rows: the temperature and the
  // sunset share the "%" line (338 − the box's raise).
  const pctY = 338 - (box.raise ?? 0);
  svg += weatherIcon(w.now.code, -6, 64, iconSize);
  svg += text(iconSize / 2, pctY, deg(w.now.temp), { ...TYPE.display, underline: false }, { anchor: "middle" });
  // Today: conditions, high/low, wind, sunset (the forecast starts tomorrow).
  const midX = 249;
  const midW = leftW - midX;
  const cond = weatherText(w.now.code);
  const today = w.days[0];
  svg += text(midX, pctY - 162, cond, { ...TYPE.body, size: fitSize(cond, TYPE.body, midW) });
  svg += text(midX, pctY - 108, `${deg(today.max)} / ${deg(today.min)}`, TYPE.body);
  svg += detail("wind", midX, pctY - 54, `${deNumber(Math.round(w.now.wind))} km/h`);
  svg += detail("sunset", midX, pctY, w.sunset);

  const colX = leftW + 56;
  const colW = (box.w - colX) / 3;
  const colText = colW - 24; // keep a gap before the next column
  // `box.raise` lifts the forecast columns.
  svg += `<g transform="translate(0 ${-(box.raise ?? 0)})">`;
  w.days.slice(1, 4).forEach((d, i) => {
    // Each day's stack is centred in its column.
    const cx = Math.round(colX + i * colW + colW / 2);
    const mid = { anchor: "middle" };
    const day = dayName(d.date, i + 1);
    svg += text(cx, 96, day, { ...TYPE.strong, size: fitSize(day, TYPE.strong, colText) }, mid);
    svg += weatherIcon(d.code, cx - 48, 122, 96);
    const temps = `${deg(d.max)} / ${deg(d.min)}`;
    svg += text(cx, 284, temps, { ...TYPE.body, size: fitSize(temps, TYPE.body, colText) }, mid);
    // Chance and amount on separate lines so they never run into the next column.
    svg += text(cx, 338, `${d.pop ?? 0} %`, TYPE.body, mid);
    if (d.mm >= 0.1) svg += text(cx, 388, `${deNumber(d.mm, d.mm < 10 ? 1 : 0)} mm`, TYPE.body, mid);
  });
  svg += "</g>";
  return svg;
}
