# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

bildergram is a TRMNL BYOS (Bring-Your-Own-Server) on Cloudflare Workers. A cron job renders dashboard PNGs (1-bit) for jailbroken Kindles, which run KOReader + `trmnl.koplugin`, and stores them in R2. The Kindles poll `GET /api/display`, which returns JSON pointing at `/media/<file>.png`. A vanilla-TS admin SPA (`index.html` → `src/client/main.ts`) is served from the Worker's static assets.

## Commands

```bash
npm run dev      # vite dev — runs the Worker in workerd locally (secrets from .dev.vars)
npm run build    # vite build → dist/bildergram (worker) + dist/client (SPA)
npm run deploy   # build + wrangler deploy
npm run types    # regenerate worker-configuration.d.ts (gitignored) from wrangler.jsonc + .dev.vars
npm run glyphs   # regenerate src/pipeline/glyphs.ts from assets/fonts/Arimo.ttf (~1 min)
npm run lint     # tsc --noEmit for the WORKER only (src/client is excluded)
npx tsc --noEmit -p src/client   # typecheck the admin SPA (DOM lib), not covered by lint
```

The repo has no test suite or test runner. To check a change, typecheck both projects, then trigger a render against `npm run dev` with `curl -X POST localhost:5173/api/admin/render/kindle_01` and view `/media/kindle_01_latest.png` or the admin SPA. The `/api/display` endpoint needs an `Access-Token` (or `Authorization: Bearer`) header matching the device's token. An optional `ID` header must match the device's MAC.

Run `npm run types` again whenever you change `wrangler.jsonc` bindings or `.dev.vars`. The global `Env` type only knows about secrets that appear in `.dev.vars`. Optional secrets (`OPENWEATHERMAP_API_KEY`, `TODOIST_API_KEY`, `GOOGLE_CALENDAR_ACCESS_TOKEN`, `APPLE_CALENDAR_ICS_URL_01`, …) are declared by hand on `AppEnv` in `src/types.ts`.

## Architecture

**Request routing** (`src/worker.ts`): handles only `/api/display`, `/media/*` and `/api/admin/*`. Everything else falls through to `env.ASSETS` (the SPA, with `not_found_handling: single-page-application`). The admin API is unauthenticated and sends CORS `*`.

**Render pipeline**: a cron (UTC; every 15 min from 06:00 to 22:45, hourly overnight) or the admin POST runs `renderAllDevices` in `src/pipeline/scheduler.ts`, which does the following for each device, with each device isolated via `Promise.allSettled`:
1. `aggregateDeviceData` (`src/data/aggregate.ts`) fetches each configured source: weather (OpenWeatherMap), calendar (Google Calendar if `GOOGLE_CALENDAR_ACCESS_TOKEN` is set, otherwise an ICS URL), and tasks (Todoist). If a fetch fails, it falls back to the cached copy and sets `errors.<source>`, which draws the "stale" warning triangle.
2. `renderDeviceImage` creates a `Bitmap` canvas, calls `drawDashboard` (`src/pipeline/draw.ts`), then `encodeGray1Png` (`src/pipeline/eink.ts`).
3. The PNG is written to R2 at `device.r2Key`.

**R2 object metadata is the only persistence layer.** No KV or D1 is used. Each PNG's `customMetadata` holds render-health fields (`renderedAt`, `renderCount`, `lastOutcome`, `lastError`) and the last-known source data as JSON strings (`cachedWeather`, `cachedEvents`, …). `src/data/cached.ts` reads these back for the fallback. Two constraints come with this:
- R2 limits user metadata to about 2KB (error 10012). `fitMetadata` halves or drops the cached blobs until the whole thing fits in `METADATA_MAX_BYTES`. Any new metadata field must fit in that budget too.
- R2 has no metadata-only update. On a failed render, the scheduler re-PUTs the existing image body with updated metadata so the device keeps showing the stale image.

**Rendering is pure JS. Do not add WASM, canvas or SVG rasterizers to the Worker.** The PNG encoder uses stored (uncompressed) deflate blocks. Text comes from `src/pipeline/glyphs.ts`, a generated bitmap font: Arimo (`assets/fonts/Arimo.ttf`) at one reference size with an 18px cap height.
- Each glyph stores its ink bitmap plus `x`/`y` offsets (y is measured from the cap top) and an `adv` advance width. `drawText(bm, text, x, y, size)` treats `y` as the cap top and snaps x and y to whole pixels.
- Scaling is the integer `round(size / 18)` only, so sizes 14–26 all render at 1× and 36 renders at 2×.
- Do not edit `glyphs.ts` by hand. Regenerate it with `npm run glyphs`, which runs `tools/gen-glyphs.mjs` in Node using `@resvg/resvg-wasm` (the only reason that dependency exists). It takes about a minute.
- The character set is `CHARS` in that script: printable ASCII, Latin-1 letters and a few typographic symbols such as `— · … € ’`. Accented letters missing from the table fall back to their base letter. Any other character renders as a blank space-width gap.

**Devices** (`src/devices.ts`): there is a static `DEVICES` array of `DeviceConfig`, and the config decides which widgets appear:
- Calendar appears if `calendarId` or `calendarIcsUrlEnvKey` is set.
- Weather appears only when `layout === "household-overview"` and `weatherCity` is set.
- Tasks appear only when `layout === "productivity"` and `tasksEnabled` is set.
- The metric widget appears if `metric` is set. Its `source` is `"weather"` (temperature) or `"templehof"` (Tempelhof Field open/closed status, computed locally from the hours table in `src/data/templehof.ts`, ported from openfeld).

Secrets are referenced by name, not value. `tokenEnvKey` and `calendarIcsUrlEnvKey` name an env var, which is looked up dynamically on `env`. Adding a device therefore means adding a `DEVICES` entry, running `wrangler secret put <name>` (and adding the secret to `.dev.vars` for local use), and then running `npm run types`.

**Timezone**: the clock, the date, and the Tempelhof status are computed in `Europe/Berlin`. Cron schedules are in UTC.

## Conventions

- Work is tracked in phases: the README has a checklist, and commit messages say "Phase N". When a phase's feature lands, update the README's phase list and its relevant section, such as Metrics or Configuration.
- Files open with a `// ====` banner comment that describes the module and its phase. Keep that banner style in new modules.
