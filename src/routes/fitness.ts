// ============================================================
// Fitness (Phase 12) — exercise minutes from each person's iPhone,
// shown side by side on Nacht (kindle/lib/modules/fitness.mjs).
//
// Phone endpoint (Authorization: Bearer FITNESS_TOKEN_<PERSON>):
//   POST /api/fitness        body: one day per line, "YYYY-MM-DD minutes"
//                            (a Shortcuts automation; JSON also accepted)
//                            → a short German confirmation
//
// Admin endpoints (Authorization: Bearer ADMIN_TOKEN):
//   GET  /api/admin/fitness  { people: [{ id, name, goals, totals, tokenSet, syncedAt, days, … }] }
//   PUT  /api/admin/fitness  { goals: { <person>: { day, week, year } } } (minutes)
//
// iPhones only let Health data be read while unlocked; a locked read
// comes back empty or zero. So each day keeps the highest value ever
// received, and a bad read never wipes real minutes.
// ============================================================

import { adminAuthorized, berlinDate, readJson, writeJson } from "../state";
import type { AppEnv } from "../types";

export interface Person {
  id: string;
  name: string;
  /** Worker secret holding this person's iPhone token. */
  tokenEnvKey: string;
}

/** Shown in this order, side by side, on every Kindle. */
export const PEOPLE: Person[] = [
  { id: "matt", name: "Matt", tokenEnvKey: "FITNESS_TOKEN_MATT" },
  { id: "fiona", name: "Fiona", tokenEnvKey: "FITNESS_TOKEN_FIONA" },
];

interface FitnessRecord {
  /** Exercise minutes per Berlin date. */
  days: Record<string, number>;
  /** Last post with real minutes (a locked iPhone reads all zeros). */
  syncedAt: string | null;
  /** Last post of any kind, and what came of it (for setting up the Shortcut). */
  receivedAt: string | null;
  lastPayload: string;
  lastResult: string;
}

interface Goals {
  day: number;
  week: number;
  year: number;
}

interface FitnessSettings {
  /** Per person; a bare number is a Phase 12 weekly goal. */
  goals: Record<string, Goals | number>;
}

const DEFAULT_GOALS: Goals = { day: 30, week: 150, year: 7800 };
const GOAL_LIMITS: Record<keyof Goals, [number, number]> = { day: [5, 600], week: [10, 3000], year: [100, 100_000] };
/** Over a year, so the year bar can count from January 1. */
const KEEP_DAYS = 400;
const DAY_MS = 86_400_000;
const recordKey = (id: string) => `fitness/${id}.json`;
const SETTINGS_KEY = "fitness/settings.json";
const EMPTY: FitnessRecord = { days: {}, syncedAt: null, receivedAt: null, lastPayload: "", lastResult: "" };

const shiftDate = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Monday–Sunday dates of the week containing `date`. */
function weekOf(date: string): string[] {
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => shiftDate(date, i - weekday));
}

function minutesValue(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1440 ? Math.round(n) : null;
}

/**
 * Days and minutes from a post. Text: one day per line (or `;`), a date
 * as 2026-11-24 or 24.11.2026 (a time after it is ignored) and the
 * minutes, e.g. "2026-11-24 35" or "24.11.2026, 00:00 35 min". JSON:
 * { "days": { "2026-11-24": 35 } }, a bare map, or [{ date, minutes }].
 */
export function parseMinutes(body: string): Record<string, number> {
  const out: Record<string, number> = {};
  const put = (date: string, v: unknown) => {
    const n = minutesValue(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && n !== null) out[date] = Math.max(out[date] ?? 0, n);
  };
  const trimmed = body.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const j = JSON.parse(trimmed) as unknown;
      if (Array.isArray(j)) {
        for (const e of j) if (e && typeof e === "object") put(String((e as Record<string, unknown>).date ?? ""), (e as Record<string, unknown>).minutes ?? (e as Record<string, unknown>).value);
      } else if (j && typeof j === "object") {
        const map = ((j as Record<string, unknown>).days ?? j) as Record<string, unknown>;
        for (const [d, v] of Object.entries(map)) put(d, v);
      }
      return out;
    } catch {
      // Not JSON after all: read it as text.
    }
  }
  for (const line of trimmed.split(/[\n;]+/)) {
    let date: string | null = null;
    let rest = line;
    const iso = line.match(/(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{1,2}:\d{2}(?::\d{2})?\S*)?/);
    const de = line.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s*\d{1,2}:\d{2}(?::\d{2})?)?/);
    if (iso) {
      date = `${iso[1]}-${iso[2]}-${iso[3]}`;
      rest = line.replace(iso[0], " ");
    } else if (de) {
      date = `${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}`;
      rest = line.replace(de[0], " ");
    }
    const num = rest.replace(/\d{1,2}:\d{2}(?::\d{2})?/g, " ").match(/\d+(?:[.,]\d+)?/);
    if (date && num) put(date, num[0]);
  }
  return out;
}

async function readSettings(env: AppEnv): Promise<FitnessSettings> {
  return (await readJson<FitnessSettings>(env, SETTINGS_KEY)) ?? { goals: {} };
}

function goalsOf(settings: FitnessSettings, id: string): Goals {
  const g = settings.goals[id];
  if (typeof g === "number") return { ...DEFAULT_GOALS, week: g, year: g * 52 };
  return { ...DEFAULT_GOALS, ...(g ?? {}) };
}

/** Minutes on `date`, in its week and in its calendar year. */
function totals(days: Record<string, number>, date: string): Goals {
  const week = new Set(weekOf(date));
  let w = 0;
  let y = 0;
  for (const [d, v] of Object.entries(days)) {
    if (week.has(d)) w += v;
    if (d.slice(0, 4) === date.slice(0, 4) && d <= date) y += v;
  }
  return { day: days[date] ?? 0, week: w, year: y };
}

/**
 * The renderer's `fitness` parameter: everyone's minutes for the week
 * around `date`, their year total, goals and last sync (JSON, a few
 * hundred bytes).
 */
export async function fitnessParam(env: AppEnv, date: string): Promise<string> {
  const settings = await readSettings(env);
  const records = await Promise.all(PEOPLE.map((p) => readJson<FitnessRecord>(env, recordKey(p.id))));
  const week = new Set(weekOf(date));
  return JSON.stringify({
    people: PEOPLE.map((p, i) => {
      const r = records[i] ?? EMPTY;
      return {
        name: p.name,
        goals: goalsOf(settings, p.id),
        days: Object.fromEntries(Object.entries(r.days).filter(([d]) => week.has(d))),
        year: totals(r.days, date).year,
        syncedAt: r.syncedAt,
      };
    }),
  });
}

// ------------------------------------------------------------------
// Phone endpoint
// ------------------------------------------------------------------

function personFor(request: Request, env: AppEnv): Person | null {
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : (request.headers.get("Access-Token") ?? "");
  if (!token) return null;
  return PEOPLE.find((p) => {
    const expected = (env as unknown as Record<string, unknown>)[p.tokenEnvKey];
    return typeof expected === "string" && expected !== "" && expected === token;
  }) ?? null;
}

const text = (body: string, status = 200) =>
  new Response(`${body}\n`, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function handleFitnessPhone(request: Request, env: AppEnv): Promise<Response> {
  if (request.method !== "POST") return text("POST only", 405);
  const person = personFor(request, env);
  if (!person) return text("unauthorized", 401);

  const body = (await request.text()).slice(0, 20_000);
  const today = berlinDate();
  const oldest = shiftDate(today, -KEEP_DAYS);
  const tomorrow = shiftDate(today, 1);
  const parsed = Object.entries(parseMinutes(body)).filter(([d]) => d >= oldest && d <= tomorrow);

  const record = (await readJson<FitnessRecord>(env, recordKey(person.id))) ?? { ...EMPTY };
  const now = new Date().toISOString();
  for (const [d, v] of parsed) record.days[d] = Math.max(record.days[d] ?? 0, v);
  record.days = Object.fromEntries(Object.entries(record.days).filter(([d]) => d >= oldest).sort(([a], [b]) => a.localeCompare(b)));
  if (parsed.some(([, v]) => v > 0)) record.syncedAt = now;
  record.receivedAt = now;
  record.lastPayload = body.slice(0, 600);

  const weekTotal = weekOf(today).reduce((sum, d) => sum + (record.days[d] ?? 0), 0);
  record.lastResult = parsed.length ? `${parsed.length} days read` : "no days found in the body";
  await writeJson(env, recordKey(person.id), record);

  if (!parsed.length) {
    return text(`Keine Tage gefunden. Erwartet: eine Zeile pro Tag, z. B. "${today} 35".`, 400);
  }
  return text(`Gespeichert: ${parsed.length} ${parsed.length === 1 ? "Tag" : "Tage"} · diese Woche ${weekTotal} min`);
}

// ------------------------------------------------------------------
// Admin endpoints
// ------------------------------------------------------------------

export async function handleFitnessAdmin(request: Request, env: AppEnv): Promise<Response> {
  const denied = adminAuthorized(request, env);
  if (denied) return denied;

  if (request.method === "PUT") {
    let body: { goals?: Record<string, Partial<Record<keyof Goals, unknown>>> };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "invalid JSON" }, { status: 400 });
    }
    const goals: Record<string, Goals> = {};
    for (const p of PEOPLE) {
      const g = { ...DEFAULT_GOALS };
      for (const k of Object.keys(GOAL_LIMITS) as (keyof Goals)[]) {
        const v = Number(body.goals?.[p.id]?.[k] ?? DEFAULT_GOALS[k]);
        const [lo, hi] = GOAL_LIMITS[k];
        if (!Number.isInteger(v) || v < lo || v > hi) return Response.json({ error: `${p.name}'s ${k} goal must be ${lo}–${hi} minutes` }, { status: 400 });
        g[k] = v;
      }
      goals[p.id] = g;
    }
    await writeJson(env, SETTINGS_KEY, { goals } satisfies FitnessSettings);
  } else if (request.method !== "GET") {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const settings = await readSettings(env);
  const today = berlinDate();
  const week = weekOf(today);
  const records = await Promise.all(PEOPLE.map((p) => readJson<FitnessRecord>(env, recordKey(p.id))));
  return Response.json(
    {
      today,
      week,
      people: PEOPLE.map((p, i) => {
        const r = records[i] ?? EMPTY;
        return {
          id: p.id,
          name: p.name,
          goals: goalsOf(settings, p.id),
          totals: totals(r.days, today),
          tokenSet: typeof (env as unknown as Record<string, unknown>)[p.tokenEnvKey] === "string",
          days: Object.fromEntries(Object.entries(r.days).filter(([d]) => d >= shiftDate(today, -13))),
          syncedAt: r.syncedAt,
          receivedAt: r.receivedAt,
          lastPayload: r.lastPayload,
          lastResult: r.lastResult,
        };
      }),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
