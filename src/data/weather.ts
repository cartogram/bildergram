// ============================================================
// Weather Source — OpenWeatherMap (Phase 3)
// Current conditions via /data/2.5/weather and a short daily
// forecast via /data/2.5/onecall, using the
// OPENWEATHERMAP_API_KEY Worker secret.
// ============================================================

import type { AppEnv, DeviceConfig, ForecastDay, WeatherData } from "../types";
import { readCached } from "./cached";

const OWM_BASE = "https://api.openweathermap.org";

export async function fetchWeather(device: DeviceConfig, env: AppEnv): Promise<WeatherData | null> {
  if (!device.weatherCity || !env.OPENWEATHERMAP_API_KEY) return null;
  const url = `${OWM_BASE}/data/2.5/weather?q=${encodeURIComponent(device.weatherCity)}&units=metric&appid=${env.OPENWEATHERMAP_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenWeatherMap returned ${res.status}`);
  return parseWeather(await res.json());
}

export async function fetchForecast(
  device: DeviceConfig,
  env: AppEnv,
  coords?: { lat?: number; lon?: number },
): Promise<ForecastDay[]> {
  if (!device.weatherCity || !env.OPENWEATHERMAP_API_KEY) return [];
  const lat = coords?.lat;
  const lon = coords?.lon;
  if (typeof lat !== "number" || typeof lon !== "number") return [];
  const url = `${OWM_BASE}/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=current,minutely,hourly,alerts&units=metric&appid=${env.OPENWEATHERMAP_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenWeatherMap returned ${res.status}`);
  return parseForecast(await res.json());
}

export function parseWeather(json: unknown): WeatherData | null {
  if (!json || typeof json !== "object") return null;
  const o = json as {
    coord?: { lat?: number; lon?: number };
    weather?: Array<{ main?: string; description?: string }>;
    main?: { temp?: number; feels_like?: number; humidity?: number };
    wind?: { speed?: number };
  };
  const main = o.main ?? {};
  const temp = Number(main.temp);
  if (Number.isNaN(temp)) return null;
  const condition = (o.weather?.[0]?.main ?? "").trim();
  return {
    temp: Math.round(temp),
    feelsLike: Math.round(Number(main.feels_like ?? temp)),
    humidity: Math.round(Number(main.humidity ?? 0)),
    windSpeed: Math.round(Number(o.wind?.speed ?? 0) * 10) / 10,
    condition: condition || "Unknown",
    description: o.weather?.[0]?.description ?? "",
    iconName: weatherIconName(condition),
    lat: typeof o.coord?.lat === "number" ? o.coord.lat : undefined,
    lon: typeof o.coord?.lon === "number" ? o.coord.lon : undefined,
  };
}

export function parseForecast(json: unknown): ForecastDay[] {
  if (!json || typeof json !== "object") return [];
  const o = json as {
    daily?: Array<{
      dt?: number;
      temp?: { max?: number; min?: number };
      weather?: Array<{ main?: string }>;
    }>;
  };
  const days: ForecastDay[] = [];
  // Skip the first entry — today's conditions come from the current weather.
  for (const d of o.daily?.slice(1) ?? []) {
    const condition = d.weather?.[0]?.main ?? "Unknown";
    days.push({
      date: d.dt ? formatDay(d.dt * 1000) : "",
      condition,
      iconName: weatherIconName(condition),
      high: Math.round(d.temp?.max ?? 0),
      low: Math.round(d.temp?.min ?? 0),
    });
    if (days.length >= 3) break;
  }
  return days.filter((d) => d.date !== "");
}

/** Map an OWM condition name to an icon slug used by the SVG templates. */
export function weatherIconName(condition: string): string {
  const c = condition.toLowerCase();
  if (c.includes("clear")) return "sunny";
  if (c.includes("few") || c.includes("scattered") || c.includes("broken")) return "partly-cloudy";
  if (c.includes("overcast") || c.includes("cloud")) return "cloudy";
  if (c.includes("rain") || c.includes("drizzle") || c.includes("shower")) return "rain";
  if (c.includes("thunder")) return "storm";
  if (c.includes("snow")) return "snow";
  if (
    c.includes("mist") || c.includes("fog") || c.includes("haze") ||
    c.includes("smoke") || c.includes("dust") || c.includes("sand")
  ) {
    return "fog";
  }
  return "cloudy";
}

export async function getCachedWeather(env: AppEnv, device: DeviceConfig): Promise<WeatherData | null> {
  return readCached<WeatherData>(env, device, "cachedWeather");
}

export async function getCachedForecast(env: AppEnv, device: DeviceConfig): Promise<ForecastDay[]> {
  return (await readCached<ForecastDay[]>(env, device, "cachedForecast")) ?? [];
}

function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
