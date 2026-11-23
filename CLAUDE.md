# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

bildergram has two independent parts:
- **The Worker** (`src/`): a TRMNL BYOS (Bring-Your-Own-Server) on Cloudflare Workers. A cron job renders dashboard PNGs (1-bit) and stores them in R2. Kindles running KOReader + `trmnl.koplugin` poll `GET /api/display`, which returns JSON pointing at `/media/<file>.png`. A vanilla-TS admin SPA (`index.html` → `src/client/main.ts`) is served from the Worker's static assets. No device currently uses it; Kindle #2 is undecided.
- **The Kindle dashboard** (`kindle/`): Kindle #1, a Paperwhite 3 on battery, runs a standalone Tempelhof Field dashboard with no server and Wi-Fi off. See the section below.

The account is on the Workers **free plan** (10 ms CPU per invocation), which rules out heavy rendering in the Worker.

## Commands

```bash
npm run dev      # vite dev — runs the Worker in workerd locally (secrets from .dev.vars)
npm run build    # vite build → dist/bildergram (worker) + dist/client (SPA)
npm run deploy   # build + wrangler deploy
npm run types    # regenerate worker-configuration.d.ts (gitignored) from wrangler.jsonc + .dev.vars
npm run glyphs   # regenerate src/pipeline/glyphs.ts from assets/fonts/Arimo.ttf (~1 min)
npm run lint     # tsc --noEmit for the WORKER only (src/client is excluded)
npx tsc --noEmit -p src/client   # typecheck the admin SPA (DOM lib), not covered by lint

npm run kindle:build                              # kindle/dist: schedule, images, preview (~20 s)
KINDLE_HOST=<ip> npm run kindle:install           # copy kindle/dist to the Kindle over SSH
TEMPELHOF_DIR=$PWD/kindle/dist/tempelhof dash kindle/device/tempelhof.sh plan <epoch>   # test the device loop's lookup locally
```

The repo has no test suite or test runner. To check a change, typecheck both projects, then trigger a render against `npm run dev` with `curl -X POST localhost:5173/api/admin/render/kindle_01` and view `/media/kindle_01_latest.png` or the admin SPA. The `/api/display` endpoint needs an `Access-Token` (or `Authorization: Bearer`) header matching the device's token. An optional `ID` header must match the device's MAC.

Run `npm run types` again whenever you change `wrangler.jsonc` bindings or `.dev.vars`. The global `Env` type only knows about secrets that appear in `.dev.vars`. Optional secrets (`OPENWEATHERMAP_API_KEY`, `TODOIST_API_KEY`, `GOOGLE_CALENDAR_ACCESS_TOKEN`, `APPLE_CALENDAR_ICS_URL_01`, …) are declared by hand on `AppEnv` in `src/types.ts`.

## Architecture

**Request routing** (`src/worker.ts`): handles only `/api/display`, `/media/*` and `/api/admin/*`. Everything else falls through to `env.ASSETS` (the SPA, with `not_found_handling: single-page-application`). The admin API is unauthenticated and sends CORS `*`.

Known issue: trmnl-koreader only re-downloads when the `filename` in the `/api/display` response changes (it keeps `last_image_filename` in memory), and `display.ts` always returns `kindle_0x_latest.png`. A running plugin therefore keeps showing its first image. Fix that before pointing a device at the Worker again.

**Render pipeline**: a cron (UTC; every 15 min from 06:00 to 22:45, hourly overnight) or the admin POST runs `renderAllDevices` in `src/pipeline/scheduler.ts`, which does the following for each device, with each device isolated via `Promise.allSettled`:
1. `aggregateDeviceData` (`src/data/aggregate.ts`) fetches each configured source: weather (OpenWeatherMap), calendar (Google Calendar if `GOOGLE_CALENDAR_ACCESS_TOKEN` is set, otherwise an ICS URL), and tasks (Todoist). If a fetch fails, it falls back to the cached copy and sets `errors.<source>`, which draws the "stale" warning triangle.
2. `renderDeviceImage` creates a `Bitmap` canvas, calls `drawDashboard` (`src/pipeline/draw.ts`), then `encodeGray1Png` (`src/pipeline/eink.ts`).
3. The PNG is written to R2 at `device.r2Key`.

**R2 object metadata is the only persistence layer.** No KV or D1 is used. Each PNG's `customMetadata` holds render-health fields (`renderedAt`, `renderCount`, `lastOutcome`, `lastError`) and the last-known source data as JSON strings (`cachedWeather`, `cachedEvents`, …). `src/data/cached.ts` reads these back for the fallback. Two constraints come with this:
- R2 limits user metadata to about 2KB (error 10012). `fitMetadata` halves or drops the cached blobs until the whole thing fits in `METADATA_MAX_BYTES`. Any new metadata field must fit in that budget too.
- R2 has no metadata-only update. On a failed render, the scheduler re-PUTs the existing image body with updated metadata so the device keeps showing the stale image.

**The Worker's renderer is pure JS.** An old commit says workerd forbids WebAssembly. That is only true for compiling WASM from bytes at runtime: importing a `.wasm` module works, and resvg rendered a 1024×758 PNG in local workerd in about 20 ms. The cost is about 3 MB of bundle and about 20 ms of CPU per render, which is over the free plan's limit, so keep the Worker pure JS unless the plan changes. The PNG encoder uses stored (uncompressed) deflate blocks. Text comes from `src/pipeline/glyphs.ts`, a generated bitmap font: Arimo (`assets/fonts/Arimo.ttf`) at one reference size with an 18px cap height.
- Each glyph stores its ink bitmap plus `x`/`y` offsets (y is measured from the cap top) and an `adv` advance width. `drawText(bm, text, x, y, size)` treats `y` as the cap top and snaps x and y to whole pixels.
- Scaling is the integer `round(size / 18)` only, so sizes 14–26 all render at 1× and 36 renders at 2×.
- Do not edit `glyphs.ts` by hand. Regenerate it with `npm run glyphs`, which runs `tools/gen-glyphs.mjs` in Node using `@resvg/resvg-wasm` (the only reason that dependency exists). It takes about a minute.
- The character set is `CHARS` in that script: printable ASCII, Latin-1 letters and a few typographic symbols such as `— · … € ’`. Accented letters missing from the table fall back to their base letter. Any other character renders as a blank space-width gap.

**Devices** (`src/devices.ts`): there is a static `DEVICES` array of `DeviceConfig`, and the config decides which widgets appear:
- Calendar appears if `calendarId` or `calendarIcsUrlEnvKey` is set.
- Weather appears only when `layout === "household-overview"` and `weatherCity` is set.
- Tasks appear only when `layout === "productivity"` and `tasksEnabled` is set.
- The metric widget appears if `metric` is set. Its `source` is `"weather"` (temperature) or `"templehof"` (Tempelhof Field open/closed status, computed locally from the hours table in `src/data/templehof.ts`, ported from openfeld).

The `kindle_01` entry is stale: it says 1024×758 (the Paperwhite 1/2 resolution), but the device is a Paperwhite 3 (1448×1072), and it no longer talks to the Worker.

Secrets are referenced by name, not value. `tokenEnvKey` and `calendarIcsUrlEnvKey` name an env var, which is looked up dynamically on `env`. Adding a device therefore means adding a `DEVICES` entry, running `wrangler secret put <name>` (and adding the secret to `.dev.vars` for local use), and then running `npm run types`.

**Timezone**: the clock, the date, and the Tempelhof status are computed in `Europe/Berlin`. Cron schedules are in UTC.

## Kindle dashboard (`kindle/`)

The Tempelhof status depends only on the hours table and the clock, so everything is precomputed on the Mac and the Kindle never fetches anything. A Wi-Fi-backed panel could be added later: the Kindle would fetch a small pre-rendered panel image occasionally, and the Worker could render one panel within the free plan.

**Build** (`kindle/build.mjs`, plain Node; no bundler, no typecheck):
- It imports `src/data/templehof.ts` directly through Node's native type stripping. Keep that file free of imports and of non-erasable TS syntax (enums, namespaces, parameter properties).
- It writes `schedule.txt`, one line per event: `<epoch-seconds> <open|close> <background-key>`. The key is the background to show *before* the event, e.g. `open_0700-1800`.
- It checks the schedule against `getTemplehofStatus` every 7 minutes for a year and fails the build on any mismatch.
- Images: `img/bg/<key>.png` (full screen), `img/cd/<minutes>.png` (countdown, minutes rounded up), `img/date/YYYY-MM-DD.png` and `img/battery-low.png`. `layout.env` holds the `eips` paste positions.
- resvg-wasm gotchas: `img.pixels` is a getter that copies out of WASM memory on every read, so read it once (reading it per pixel made the build take over 10 minutes). resvg ignores `font-weight` with the variable Arimo font, so bold is faked with a stroke.

**Panel**: the Paperwhite 3 framebuffer is 1072×1448 *portrait*, 8 bpp grayscale. `eips -g` pastes pixels as-is, with no scaling, rotation or depth conversion. So images are 8-bit gray PNGs, rotated counter-clockwise (`KINDLE_ROTATE=cw` flips them), with paste positions in portrait coordinates. 1-bit PNGs display wrongly.

**Device loop** (`kindle/device/tempelhof.sh`, busybox `sh`, installed to `/mnt/us/tempelhof`):
- Every minute it wakes, looks up the next event with `awk`, and pastes the countdown with `eips`. Every 15 minutes, and on state changes, it does a full redraw (`eips -f`). It then sets `/sys/class/rtc/rtc1/wakealarm` to `+N` and runs `echo mem > /sys/power/state`.
- **Exit detection**: after a timer wake, `wakealarm` reads empty. After a power-button or USB wake it still holds the pending alarm, and the loop exits. Scripts cannot see power-button key events on this model.
- It stops `lab126_gui` and `webreader` again on every loop, because a wake can relaunch them. It must not stop `framework` directly, because that kills the power button. Stopping `lab126_gui` takes `framework` down anyway, and restarting it on exit reloads the whole UI, which looks like a reboot. `powerd` returns to `active` by itself.
- It turns Wi-Fi off (`lipc-set-prop com.lab126.wifid enable 0`) and restores it on exit.
- The Kindle's own zone setting is garbage, so the script uses the POSIX rule `CET-1CEST,M3.5.0,M10.5.0/3`. Busybox `date -d @<epoch>` works.

**Launching**: there is no KUAL. It is obsolete on WinterBreak 2 (the hdnext stack). Scriptlets in `/mnt/us/documents/*.sh` show up as books. sh_integration runs them as root through `/var/local/mkk/su` and waits for them to exit, so the start books detach the loop with `setsid ... &`. A script's stdout is shown on screen through FBInk unless it has a `# DontUseFBInk` header. Run `lipc-set-prop com.lab126.scanner doFullScan 1` after adding books over SSH.

**Access for testing**: KOReader → gear → Network → SSH server. It listens on port 2222 as root, with keys in `koreader/settings/SSH/authorized_keys`, and keeps running after KOReader exits. Kindle Wi-Fi dozes, so a first connection can fail with "No route to host"; retry. `tempelhof.sh once` draws one frame over whatever is on screen without suspending. `/mnt/us/tempelhof/tempelhof.log` (UTC) records starts, the battery level hourly, and exit reasons. The first per-minute wakes and the power-button exit were verified on the device; battery life over a long run has not been measured yet.

## Conventions

- Work is tracked in phases: the README has a checklist, and commit messages say "Phase N". When a phase's feature lands, update the README's phase list and its relevant section, such as Metrics or Configuration.
- Files open with a `// ====` banner comment that describes the module and its phase. Keep that banner style in new modules.
