// ============================================================
// Dashboard Data Aggregator (Phase 3)
// Coordinates the source fetchers per device. Each configured
// source falls back to its cached R2 metadata when the live
// fetch fails (graceful degradation), and surfaces availability
// through the `errors` flags for "stale data" warning icons.
// ============================================================

import type { AppEnv, DashboardData, DeviceConfig } from "../types";
import { fetchWeather, fetchForecast, getCachedWeather, getCachedForecast } from "./weather";
import { fetchEvents, getCachedEvents } from "./calendar";
import { fetchTasks, getCachedTasks } from "./tasks";

interface SourceResult<T> {
  /** Latest known data (fresh, or cached); null when nothing is available. */
  data: T | null;
  /** True when there was no fresh data — the widget shows a warning. */
  stale: boolean;
}

async function loadSource<T>(
  fetchFn: () => Promise<T | null>,
  cachedFn: () => Promise<T | null>,
): Promise<SourceResult<T>> {
  let fresh: T | null = null;
  try {
    fresh = await fetchFn();
  } catch (err) {
    console.error("[aggregate] source fetch failed:", err);
  }
  if (fresh) return { data: fresh, stale: false };
  const cached = await cachedFn().catch(() => null);
  return { data: cached, stale: true };
}

export async function aggregateDeviceData(
  device: DeviceConfig,
  env: AppEnv,
): Promise<DashboardData> {
  const data: DashboardData = { errors: {} };

  if (device.weatherCity) {
    const weather = await loadSource(
      () => fetchWeather(device, env),
      () => getCachedWeather(env, device),
    );
    data.weather = weather.data ?? undefined;
    if (weather.stale) data.errors.weather = true;

    const forecast = await loadSource(
      () => fetchForecast(device, env, { lat: data.weather?.lat, lon: data.weather?.lon }),
      () => getCachedForecast(env, device),
    );
    data.forecast = forecast.data?.length ? forecast.data : undefined;
  }

  if (device.calendarId || device.calendarIcsUrl) {
    const events = await loadSource(
      () => fetchEvents(device, env),
      () => getCachedEvents(env, device),
    );
    data.events = events.data?.length ? events.data : undefined;
    if (events.stale) data.errors.calendar = true;
  }

  if (device.tasksEnabled) {
    const tasks = await loadSource(
      () => fetchTasks(device, env),
      () => getCachedTasks(env, device),
    );
    data.tasks = tasks.data?.length ? tasks.data : undefined;
    if (tasks.stale) data.errors.tasks = true;
  }

  return data;
}
