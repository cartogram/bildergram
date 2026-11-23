// ============================================================
// Kindle hub (Phase 9) — schedule, status and screen images for
// the Kindle dashboard (kindle/device/dashboard.sh).
//
// Device endpoints (Access-Token = DEVICE_TOKEN_KINDLE_01):
//   POST /api/kindle/checkin               body: log tail; query: battery, charging,
//                                          screen, version, reason
//                                          → shell-safe env (SCHEDULE, CHECKIN_MINUTES, …)
//   GET  /api/kindle/screen/<id>.png?day=&battery=
//                                          the screen's base (rotated, for eips)
//
// Admin endpoints (Authorization: Bearer ADMIN_TOKEN):
//   GET  /api/admin/kindle                 { config, status, cinemas, screens }
//   PUT  /api/admin/kindle/config          replace the config
//   GET  /api/admin/kindle/screen?screen=  full preview of a screen (PNG)
//
// Screens are rendered by the Vercel function (RENDERER_URL); the
// Worker only passes bytes through, which keeps it far under the free
// plan's CPU limit. State lives in R2 as small JSON objects.
// ============================================================

import { authenticateDevice } from "../devices";
import type { AppEnv } from "../types";

/** The screens kindle/lib/screens.mjs defines (ids, German names, what they show). */
export const SCREENS = {
  morgen: { name: "Morgen", shows: "Weather (wide) + expression of the day" },
  tag: { name: "Tag", shows: "Tempelhof countdown + weather" },
  abend: { name: "Abend", shows: "Yorck cinema listing" },
  nacht: { name: "Nacht", shows: "Expression of the day" },
} as const;
export type Screen = keyof typeof SCREENS;

export interface KindleConfig {
  /** Daily timetable: from `at` (Berlin HH:MM) until the next entry, show `screen`. */
  schedule: { at: string; screen: Screen }[];
  kino: { cinemas: string[]; from: string };
  /** How often the Kindle checks in while a weather screen is showing. */
  checkinMinutes: number;
  /** One-shot: the next check-in tells the Kindle to return to its normal UI. */
  exit: boolean;
}

export interface KindleStatus {
  checkedInAt: string;
  reason: string;
  battery: number | null;
  charging: boolean;
  screen: string;
  version: string;
  log: string;
  /** Battery readings from check-ins over the last week: [epoch seconds, %]. */
  history: [number, number][];
}

const DEVICE_ID = "kindle_01";
const CONFIG_KEY = `kindle/${DEVICE_ID}/config.json`;
const STATUS_KEY = `kindle/${DEVICE_ID}/status.json`;
const HISTORY_SECONDS = 7 * 86_400;

export const DEFAULT_CONFIG: KindleConfig = {
  schedule: [
    { at: "06:00", screen: "morgen" },
    { at: "09:00", screen: "tag" },
    { at: "18:15", screen: "abend" },
    { at: "23:00", screen: "nacht" },
  ],
  kino: { cinemas: ["rollberg", "passage", "neues-off"], from: "18:00" },
  checkinMinutes: 60,
  exit: false,
};

/** Yorck cinemas (slug → name), from yorck.de/kinos. */
export const YORCK_CINEMAS: Record<string, string> = {
  "babylon-kreuzberg": "Babylon Kreuzberg",
  "blauer-stern": "Blauer Stern",
  "capitol-dahlem": "Capitol Dahlem",
  "cinema-paris": "Cinema Paris",
  "delphi-filmpalast": "Delphi Filmpalast",
  "delphi-lux": "delphi LUX",
  "filmtheater-am-friedrichshain": "Filmtheater am Friedrichshain",
  "kant-kino": "Kant Kino",
  "kino-international": "Kino International",
  "neues-off": "Neues Off",
  odeon: "Odeon",
  passage: "Passage",
  rollberg: "Rollberg",
  yorck: "Yorck",
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isScreen = (s: unknown): s is Screen => typeof s === "string" && Object.hasOwn(SCREENS, s);

// ------------------------------------------------------------------
// State
// ------------------------------------------------------------------

async function readJson<T>(env: AppEnv, key: string): Promise<T | null> {
  const obj = await env.DISPLAY_ASSETS.get(key);
  if (!obj) return null;
  try {
    return (await obj.json()) as T;
  } catch {
    return null;
  }
}

async function writeJson(env: AppEnv, key: string, value: unknown): Promise<void> {
  await env.DISPLAY_ASSETS.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: "application/json" },
  });
}

/** Phase 7 configs used "tempelhof"/"kino" and had no interval; map them. */
function migrate(c: Partial<KindleConfig> & { schedule?: { at: string; screen: string }[] }): KindleConfig {
  const old: Record<string, Screen> = { tempelhof: "tag", kino: "abend" };
  const parsed = parseConfig({
    ...DEFAULT_CONFIG,
    ...c,
    schedule: (c.schedule ?? DEFAULT_CONFIG.schedule).map((e) => ({ ...e, screen: old[e.screen] ?? e.screen })),
  });
  return typeof parsed === "string" ? DEFAULT_CONFIG : parsed;
}

async function readConfig(env: AppEnv): Promise<KindleConfig> {
  const stored = await readJson<KindleConfig>(env, CONFIG_KEY);
  return stored ? migrate(stored) : DEFAULT_CONFIG;
}

/** Validate an admin-supplied config; returns an error message or the clean config. */
export function parseConfig(input: unknown): KindleConfig | string {
  const c = input as Partial<KindleConfig> | null;
  if (!c || !Array.isArray(c.schedule) || c.schedule.length === 0) return "schedule must be a non-empty list";
  const schedule: KindleConfig["schedule"] = [];
  for (const e of c.schedule) {
    if (!e || typeof e.at !== "string" || !HHMM.test(e.at)) return `bad time: ${JSON.stringify(e?.at)}`;
    if (!isScreen(e.screen)) return `unknown screen: ${JSON.stringify(e?.screen)}`;
    schedule.push({ at: e.at, screen: e.screen });
  }
  schedule.sort((a, b) => a.at.localeCompare(b.at));
  if (new Set(schedule.map((e) => e.at)).size !== schedule.length) return "two entries share a time";

  const cinemas = Array.isArray(c.kino?.cinemas) ? c.kino.cinemas.filter((s) => s in YORCK_CINEMAS) : [];
  if (cinemas.length === 0) return "choose at least one cinema";
  const from = typeof c.kino?.from === "string" && HHMM.test(c.kino.from) ? c.kino.from : "18:00";
  const minutes = Number(c.checkinMinutes ?? DEFAULT_CONFIG.checkinMinutes);
  if (!Number.isInteger(minutes) || minutes < 15 || minutes > 360) return "check-in interval must be 15–360 minutes";
  return { schedule, kino: { cinemas, from }, checkinMinutes: minutes, exit: c.exit === true };
}

// ------------------------------------------------------------------
// Vercel renderer
// ------------------------------------------------------------------

async function renderScreen(env: AppEnv, config: KindleConfig, params: Record<string, string>): Promise<Response> {
  if (!env.RENDERER_URL) return new Response("RENDERER_URL is not configured", { status: 503 });
  const url = new URL("/api/screen", env.RENDERER_URL);
  url.searchParams.set("cinemas", config.kino.cinemas.join(","));
  url.searchParams.set("from", config.kino.from);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: env.RENDERER_TOKEN ? { "x-renderer-token": env.RENDERER_TOKEN } : {} });
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "image/png", "cache-control": "no-store" },
  });
}

/** Berlin calendar date (YYYY-MM-DD) now. */
const berlinToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });

// ------------------------------------------------------------------
// Device endpoints
// ------------------------------------------------------------------

export async function handleKindleDevice(request: Request, env: AppEnv): Promise<Response> {
  const device = authenticateDevice(request, env);
  if (!device || device.id !== DEVICE_ID) return new Response("unauthorized", { status: 401 });
  const url = new URL(request.url);
  const q = url.searchParams;

  if (url.pathname === "/api/kindle/checkin" && request.method === "POST") {
    const config = await readConfig(env);
    const previous = await readJson<KindleStatus>(env, STATUS_KEY);
    const nowSec = Math.floor(Date.now() / 1000);
    const battery = q.has("battery") && /^\d{1,3}$/.test(q.get("battery")!) ? Number(q.get("battery")) : null;
    const history = (previous?.history ?? []).filter(([t]) => t > nowSec - HISTORY_SECONDS);
    if (battery !== null) history.push([nowSec, battery]);
    const status: KindleStatus = {
      checkedInAt: new Date().toISOString(),
      reason: (q.get("reason") ?? "").slice(0, 40),
      battery,
      charging: q.get("charging") === "1",
      screen: (q.get("screen") ?? "").slice(0, 20),
      version: (q.get("version") ?? "").slice(0, 40),
      log: (await request.text()).slice(-4000),
      history: history.slice(-500),
    };
    await writeJson(env, STATUS_KEY, status);

    // The exit flag is one-shot, so the next start from the library isn't
    // sent straight back out.
    if (config.exit) await writeJson(env, CONFIG_KEY, { ...config, exit: false });

    // Shell-safe KEY="value" lines; the Kindle validates them before use.
    const lines = [
      `SCHEDULE="${config.schedule.map((e) => `${e.at.replace(":", "")}:${e.screen}`).join(" ")}"`,
      `CHECKIN_MINUTES=${config.checkinMinutes}`,
      `EXIT=${config.exit ? 1 : 0}`,
      `SERVER_TIME=${nowSec}`,
    ];
    return new Response(lines.join("\n") + "\n", {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const m = url.pathname.match(/^\/api\/kindle\/screen\/([a-z]+)\.png$/);
  if (m && request.method === "GET") {
    if (!isScreen(m[1])) return new Response("unknown screen", { status: 404 });
    const day = DAY.test(q.get("day") ?? "") ? q.get("day")! : berlinToday();
    const params: Record<string, string> = { screen: m[1], date: day };
    if (/^\d{1,3}$/.test(q.get("battery") ?? "")) params.battery = q.get("battery")!;
    return renderScreen(env, await readConfig(env), params);
  }

  return new Response("not found", { status: 404 });
}

// ------------------------------------------------------------------
// Admin endpoints
// ------------------------------------------------------------------

function adminAuthorized(request: Request, env: AppEnv): Response | null {
  if (!env.ADMIN_TOKEN) return Response.json({ error: "ADMIN_TOKEN is not set on the Worker" }, { status: 503 });
  const auth = request.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

export async function handleKindleAdmin(request: Request, env: AppEnv): Promise<Response> {
  const denied = adminAuthorized(request, env);
  if (denied) return denied;
  const url = new URL(request.url);

  if (url.pathname === "/api/admin/kindle" && request.method === "GET") {
    return Response.json(
      {
        config: await readConfig(env),
        status: await readJson<KindleStatus>(env, STATUS_KEY),
        cinemas: YORCK_CINEMAS,
        screens: SCREENS,
      },
      { headers: { "cache-control": "no-store" } },
    );
  }

  if (url.pathname === "/api/admin/kindle/config" && request.method === "PUT") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
    const parsed = parseConfig(body);
    if (typeof parsed === "string") return Response.json({ error: parsed }, { status: 400 });
    await writeJson(env, CONFIG_KEY, parsed);
    return Response.json({ config: parsed });
  }

  if (url.pathname === "/api/admin/kindle/screen" && request.method === "GET") {
    const screen = url.searchParams.get("screen");
    if (!isScreen(screen)) return Response.json({ error: "unknown screen" }, { status: 400 });
    const status = await readJson<KindleStatus>(env, STATUS_KEY);
    const params: Record<string, string> = { screen, preview: "1", date: berlinToday() };
    if (status?.battery != null) params.battery = String(status.battery);
    return renderScreen(env, await readConfig(env), params);
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
