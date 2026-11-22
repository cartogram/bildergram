// ============================================================
// Shared type definitions
// ============================================================

/** Cloudflare Worker environment — core bindings plus Phase 3 secrets. */
export interface AppEnv extends Env {
  // Phase 3 external API secrets (set via `wrangler secret put`)
  OPENWEATHERMAP_API_KEY?: string;
  GOOGLE_CALENDAR_ACCESS_TOKEN?: string;
  TODOIST_API_KEY?: string;
  HOME_ASSISTANT_TOKEN?: string;
  /** Published ICS URL for the device's Apple Calendar feed (Kindle #1) */
  APPLE_CALENDAR_ICS_URL_01?: string;
}

/**
 * Simple metric widget to show alongside the layout widgets —
 * the value is sourced from the weather data (temperature).
 */
export interface MetricConfig {
  /** Widget title (e.g. "Outdoor Temperature") */
  label: string;
  /** Unit shown after the value — defaults to "°C" when weather is present */
  unit?: string;
}

/** Configuration for a single managed display device */
export interface DeviceConfig {
  /** Internal device identifier */
  id: string;
  /** Human-readable device name */
  name: string;
  /** MAC address used in the ID header */
  macAddress: string;
  /** Environment variable name holding this device's API token */
  tokenEnvKey: string;
  /** Display width in pixels */
  width: number;
  /** Display height in pixels */
  height: number;
  /** "landscape" | "portrait" */
  orientation: "landscape" | "portrait";
  /** Default refresh rate in seconds */
  refreshRate: number;
  /** Active layout template name */
  layout: string;
  /** Simple metric widget (label + value + unit) — see MetricConfig */
  metric?: MetricConfig;
  /** R2 object key for the latest rendered image */
  r2Key: string;
  /** OpenWeatherMap city for the weather widget (e.g. "Berlin") */
  weatherCity?: string;
  /** Google Calendar calendar ID (defaults to "primary" when a token is set) */
  calendarId?: string;
  /** Env var (secret) holding the device's ICS URL — Apple Calendar feeds */
  calendarIcsUrlEnvKey?: string;
  /** Show the Todoist tasks widget (requires the TODOIST_API_KEY secret) */
  tasksEnabled?: boolean;
  /** Max calendar events per render (default 4) */
  maxCalendarEvents?: number;
  /** Max tasks per render (default 5) */
  maxTasks?: number;
}

/** TRMNL-compliant /api/display JSON response */
export interface DisplayResponse {
  status: number;
  image_url: string;
  filename: string;
  refresh_rate: number;
  reset_firmware: boolean;
  update_firmware: boolean;
}

/** Render metadata stored alongside each image in R2 */
export interface RenderMetadata {
  /** Unix timestamp (seconds) when the image was generated */
  renderedAt: number;
  /** Device ID this image was rendered for */
  deviceId: string;
  /** File size in bytes */
  fileSize: number;
  /** Layout template used */
  layout: string;
  /** Whether the render encountered any upstream errors */
  hadErrors: boolean;
  /** Number of successful renders so far (incremented per render) */
  renderCount: string;
  /** Last render outcome: "ok" or "error" */
  lastOutcome: string;
  /** Last render error message (when `lastOutcome` is "error") */
  lastError: string;
  /** Cached weather data (JSON) — used when the weather source failed */
  cachedWeather?: string;
  /** Cached 5-day forecast (JSON) */
  cachedForecast?: string;
  /** Cached calendar events (JSON) */
  cachedEvents?: string;
  /** Cached Todoist tasks (JSON) */
  cachedTasks?: string;
}

// ------------------------------------------------------------------
// Phase 3 — Aggregated dashboard data
// ------------------------------------------------------------------

/** Current weather conditions (from the OpenWeatherMap API) */
export interface WeatherData {
  /** Current temperature in °C */
  temp: number;
  /** "Feels like" temperature in °C */
  feelsLike: number;
  /** Humidity percentage (0–100) */
  humidity: number;
  /** Wind speed in m/s */
  windSpeed: number;
  /** Condition name from the API (e.g. "Clear", "Rain") */
  condition: string;
  /** Condition description (e.g. "clear sky") */
  description: string;
  /** Icon slug ("sunny" | "cloudy" | "rain" | "storm" | "snow" | "fog") */
  iconName: string;
  /** Latitude used for the forecast lookup */
  lat?: number;
  /** Longitude used for the forecast lookup */
  lon?: number;
}

/** Forecast row (from the OpenWeatherMap onecall endpoint) */
export interface ForecastDay {
  /** Display date (e.g. "Sun 2 Jun") */
  date: string;
  /** Condition name (e.g. "Clouds") */
  condition: string;
  /** Icon slug */
  iconName: string;
  /** Daily high temperature in °C */
  high: number;
  /** Daily low temperature in °C */
  low: number;
}

/** A single calendar event shown in the calendar widget */
export interface CalendarEvent {
  /** Event title */
  title: string;
  /** Display start string (e.g. "14:30" or "All day") */
  start: string;
  /** ISO 8601 start (used for sorting) */
  startIso: string;
  /** Whether the event is all-day */
  allDay: boolean;
  /** Display end string, if any */
  end?: string;
  /** Event location, if any */
  location?: string;
  /** Event description, if any */
  description?: string;
}

/** A Todoist task shown in the tasks widget */
export interface Task {
  /** Task content */
  content: string;
  /** Priority 1 (low) – 4 (urgent); higher sorts first */
  priority: number;
  /** Display due date, if any */
  due?: string;
}

/** Source error flags — set when fresh data was unavailable for a source */
export interface SourceErrors {
  weather?: boolean;
  calendar?: boolean;
  tasks?: boolean;
}

/** Aggregated dashboard data for one device (Phase 3) */
export interface DashboardData {
  weather?: WeatherData;
  forecast?: ForecastDay[];
  events?: CalendarEvent[];
  tasks?: Task[];
  /** Per-source error flags (drives "stale data" warning icons) */
  errors: SourceErrors;
}
