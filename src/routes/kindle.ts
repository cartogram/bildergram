// ============================================================
// Kindle hub (Phase 7) — schedule, status and cinema listings
// for the standalone Kindle dashboard (kindle/device/dashboard.sh).
//
// Device endpoints (Access-Token = DEVICE_TOKEN_KINDLE_01):
//   POST /api/kindle/checkin          body: log tail; query: battery, charging,
//                                     screen, version, have, reason
//                                     → shell-safe env (SCHEDULE, KINO_DAYS, …)
//   GET  /api/kindle/kino/<date>.png  rotated listing image for eips
//
// Admin endpoints (Authorization: Bearer ADMIN_TOKEN):
//   GET  /api/admin/kindle            { config, status, cinemas }
//   PUT  /api/admin/kindle/config     replace the config
//   GET  /api/admin/kindle/kino?date= unrotated listing preview (PNG), or
//                                     the published days (JSON) without date
//
// Cinema listings are rendered by the Vercel function (KINO_URL);
// the Worker only passes bytes through, which keeps it far under the
// free plan's CPU limit. State lives in R2 as small JSON objects.
// ============================================================

import { authenticateDevice } from "../devices";
import type { AppEnv } from "../types";

export type Screen = "tempelhof" | "kino";

export interface KindleConfig {
  /** Daily timetable: from `at` (Berlin HH:MM) until the next entry, show `screen`. */
  schedule: { at: string; screen: Screen }[];
  kino: { cinemas: string[]; from: string };
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
  have: string[];
  log: string;
}

const DEVICE_ID = "kindle_01";
const CONFIG_KEY = `kindle/${DEVICE_ID}/config.json`;
const STATUS_KEY = `kindle/${DEVICE_ID}/status.json`;

export const DEFAULT_CONFIG: KindleConfig = {
  schedule: [
    { at: "06:00", screen: "tempelhof" },
    { at: "18:15", screen: "kino" },
  ],
  kino: { cinemas: ["rollberg", "passage", "neues-off"], from: "18:00" },
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

const SCREENS: Screen[] = ["tempelhof", "kino"];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

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

async function readConfig(env: AppEnv): Promise<KindleConfig> {
  return (await readJson<KindleConfig>(env, CONFIG_KEY)) ?? DEFAULT_CONFIG;
}

/** Validate an admin-supplied config; returns an error message or the clean config. */
export function parseConfig(input: unknown): KindleConfig | string {
  const c = input as Partial<KindleConfig> | null;
  if (!c || !Array.isArray(c.schedule) || c.schedule.length === 0) return "schedule must be a non-empty list";
  const schedule: KindleConfig["schedule"] = [];
  for (const e of c.schedule) {
    if (!e || typeof e.at !== "string" || !HHMM.test(e.at)) return `bad time: ${JSON.stringify(e?.at)}`;
    if (!SCREENS.includes(e.screen as Screen)) return `bad screen: ${JSON.stringify(e?.screen)}`;
    schedule.push({ at: e.at, screen: e.screen as Screen });
  }
  schedule.sort((a, b) => a.at.localeCompare(b.at));
  if (new Set(schedule.map((e) => e.at)).size !== schedule.length) return "two entries share a time";

  const cinemas = Array.isArray(c.kino?.cinemas) ? c.kino.cinemas.filter((s) => s in YORCK_CINEMAS) : [];
  if (cinemas.length === 0) return "choose at least one cinema";
  const from = typeof c.kino?.from === "string" && HHMM.test(c.kino.from) ? c.kino.from : "18:00";
  return { schedule, kino: { cinemas, from }, exit: c.exit === true };
}

// ------------------------------------------------------------------
// Vercel renderer
// ------------------------------------------------------------------

async function kino(env: AppEnv, config: KindleConfig, params: Record<string, string>): Promise<Response> {
  if (!env.KINO_URL) return new Response("KINO_URL is not configured", { status: 503 });
  const url = new URL("/api/kino", env.KINO_URL);
  url.searchParams.set("cinemas", config.kino.cinemas.join(","));
  url.searchParams.set("from", config.kino.from);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return fetch(url, { headers: env.KINO_TOKEN ? { "x-kino-token": env.KINO_TOKEN } : {} });
}

async function publishedDays(env: AppEnv, config: KindleConfig): Promise<string[]> {
  const res = await kino(env, config, {});
  if (!res.ok) throw new Error(`kino renderer returned ${res.status}`);
  const body = (await res.json()) as { days?: string[] };
  return (body.days ?? []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
}

// ------------------------------------------------------------------
// Device endpoints
// ------------------------------------------------------------------

export async function handleKindleDevice(request: Request, env: AppEnv): Promise<Response> {
  const device = authenticateDevice(request, env);
  if (!device || device.id !== DEVICE_ID) return new Response("unauthorized", { status: 401 });
  const url = new URL(request.url);

  if (url.pathname === "/api/kindle/checkin" && request.method === "POST") {
    const q = url.searchParams;
    const config = await readConfig(env);
    const status: KindleStatus = {
      checkedInAt: new Date().toISOString(),
      reason: (q.get("reason") ?? "").slice(0, 40),
      battery: q.has("battery") ? Number(q.get("battery")) : null,
      charging: q.get("charging") === "1",
      screen: (q.get("screen") ?? "").slice(0, 20),
      version: (q.get("version") ?? "").slice(0, 40),
      have: (q.get("have") ?? "").split(/[ ,]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
      log: (await request.text()).slice(-4000),
    };
    await writeJson(env, STATUS_KEY, status);

    let days: string[] = [];
    let kinoError = "";
    try {
      days = await publishedDays(env, config);
    } catch (err) {
      kinoError = err instanceof Error ? err.message : String(err);
    }

    // The exit flag is one-shot, so the next start from the library isn't
    // sent straight back out.
    if (config.exit) await writeJson(env, CONFIG_KEY, { ...config, exit: false });

    // Shell-safe KEY="value" lines; the Kindle validates them before use.
    const lines = [
      `SCHEDULE="${config.schedule.map((e) => `${e.at.replace(":", "")}:${e.screen}`).join(" ")}"`,
      `KINO_DAYS="${days.join(" ")}"`,
      `EXIT=${config.exit ? 1 : 0}`,
      `SERVER_TIME=${Math.floor(Date.now() / 1000)}`,
      `KINO_ERROR="${kinoError.replace(/[^\w .:-]/g, "").slice(0, 80)}"`,
    ];
    return new Response(lines.join("\n") + "\n", {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const png = url.pathname.match(/^\/api\/kindle\/kino\/(\d{4}-\d{2}-\d{2})\.png$/);
  if (png && request.method === "GET") {
    const res = await kino(env, await readConfig(env), { date: png[1] });
    return new Response(res.body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "image/png", "cache-control": "no-store" },
    });
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
      { config: await readConfig(env), status: await readJson<KindleStatus>(env, STATUS_KEY), cinemas: YORCK_CINEMAS },
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

  if (url.pathname === "/api/admin/kindle/kino" && request.method === "GET") {
    const date = url.searchParams.get("date");
    const config = await readConfig(env);
    if (!date) {
      try {
        return Response.json({ days: await publishedDays(env, config) });
      } catch (err) {
        return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
      }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "bad date" }, { status: 400 });
    const res = await kino(env, config, { date, preview: "1" });
    return new Response(res.body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "image/png", "cache-control": "no-store" },
    });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}
