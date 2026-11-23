# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A battery-powered e-ink dashboard on a jailbroken Kindle Paperwhite 3. It shows screens on a daily schedule: **Tempelhof** (Tempelhofer Feld open/closed with a per-minute countdown) by day, and **IM KINO** (that evening's Yorck cinema listing) in the evening. There are three parts:

- **Kindle** (`kindle/`): a busybox shell loop (`kindle/device/dashboard.sh`) that wakes on the RTC alarm, pastes prebuilt images with `eips`, and suspends to RAM with Wi-Fi off.
- **Hub** (`src/`): a Cloudflare Worker, on the **free plan** (10 ms CPU per request). It stores the schedule and the last check-in in R2, serves the admin SPA, and passes listing images through from Vercel.
- **Renderer** (`api/kino.mjs`): a Vercel function (project `bildergram-kino`, team `matt-seccafiens-projects`) that fetches the yorck.de cinema pages and renders the listing PNG. It runs on Vercel because parsing and rendering need far more CPU than the free Worker allows.

The Worker, Vercel and the local build all share `kindle/lib/eink.mjs` (SVG → PNG) and `kindle/lib/kino.mjs` (yorck.de parsing and layout).

## Commands

```bash
npm run dev            # Worker + admin SPA in workerd (secrets from .dev.vars)
npm run kino:dev       # local stand-in for the Vercel function on :3999 (.dev.vars points KINO_URL here)
npm run kino:preview [YYYY-MM-DD]   # render a listing to kindle/dist/preview/
npm run kindle:build   # Tempelhof schedule + images + kindle/dist/preview/index.html (~20 s)
KINDLE_HOST=<ip> npm run kindle:install   # copy kindle/dist to the Kindle (add KINDLE_HUB_URL/KINDLE_HUB_TOKEN to (re)write hub.env)
npm run lint           # tsc for src/ and kindle/lib/*.ts
npx tsc --noEmit -p src/client   # the admin SPA (DOM lib), not covered by lint
npm run deploy         # vite build + wrangler deploy (the Worker)
vercel deploy --prod   # the renderer (the GitHub integration also deploys on push)
npm run types          # regenerate worker-configuration.d.ts after changing wrangler.jsonc or .dev.vars
npm run glyphs         # regenerate kindle/lib/glyphs.ts (0.4 s)

# test the device loop's scheduling locally (it falls back to BSD date on macOS)
DASHBOARD_DIR=$PWD/kindle/dist/dashboard dash kindle/device/dashboard.sh plan <epoch>
```

There is no test runner. Verify changes with the typechecks, `dash -n` on the shell scripts, the `plan` mode, previews, and curl against `npm run dev` + `npm run kino:dev`. Use the tokens in `.dev.vars`.

## Hub (`src/`)

- `worker.ts` routes only `/api/kindle/*` (device; `Access-Token` = `DEVICE_TOKEN_KINDLE_01`, optional `ID` = MAC) and `/api/admin/kindle*` (`Authorization: Bearer ADMIN_TOKEN`). Other `/api/*` paths return 404; everything else is the SPA via `env.ASSETS`. There are no cron triggers: `wrangler.jsonc` has an explicit empty `crons` list, which also clears schedules deployed earlier.
- `routes/kindle.ts`:
  - **Check-in** (`POST /api/kindle/checkin`): the body is the device's log tail, and the query carries battery, screen, version, held listings and reason. It replies with shell-safe `KEY="value"` lines: `SCHEDULE="0600:tempelhof 1815:kino"`, `KINO_DAYS`, `EXIT`, `SERVER_TIME`, `KINO_ERROR`. The Kindle validates them with a regex before sourcing, so keep values within `[A-Za-z0-9 :._-]`.
  - The `exit` config flag is one-shot: it is cleared once it has been sent.
  - Config and status live in R2 as JSON (`kindle/kindle_01/*.json`). The bucket is still named `trmnl-display-assets` for historical reasons.
- `KINO_URL` is a var in `wrangler.jsonc`. `ADMIN_TOKEN`, `KINO_TOKEN` and `DEVICE_TOKEN_KINDLE_01` are secrets. `AppEnv` types the hub secrets as optional regardless of what `.dev.vars` contains.
- The admin SPA (`src/client/main.ts`) keeps the token in localStorage and loads preview images with `fetch` and object URLs, because they need the auth header.

## Renderer and yorck.de

- Each `https://www.yorck.de/kinos/<slug>` page embeds its programme (~100 KB) in `__NEXT_DATA__` as `pageProps.filmsSpecials[].fields.sessions[]` (`startTime` carries the Berlin offset, plus `formats` and `cinema`). The full `/filme` page is 2.7 MB, and its `?cinema=` filters are applied client-side.
- A day counts as "published" once the chosen cinemas have at least 5 screenings on it. The programme appears about 3 days ahead, and the new week (from Thursday) appears early in the week.
- `vercel.json` sets `framework: null`, skips the Vite build, runs `npm install --omit=dev`, and lists the font, WASM, `glyphs.ts` and `kindle/lib` under `includeFiles`. `.vercelignore` must keep `.dev.vars` and `.env*` out of uploads.
- `kindle/lib/eink.mjs` imports `glyphs.ts` and `templehof.ts` through Node's native type stripping, both on Vercel and in the build. Keep those files free of imports and of non-erasable TS syntax (enums, namespaces, parameter properties).

## Images for the Paperwhite 3

- The framebuffer is 1072×1448 **portrait**, 8 bpp gray (`eips -i`). `eips -g` pastes pixels as-is, with no scaling, rotation or depth conversion. So every screen is drawn as a 1448×1072 landscape SVG, quantized to 16 grays, rotated counter-clockwise (`KINDLE_ROTATE=cw` flips it), and written as an 8-bit grayscale PNG. 1-bit PNGs display wrongly. Paste positions in `layout.env` are portrait coordinates.
- resvg-wasm gotchas:
  - `img.pixels` is a getter that copies out of WASM memory on every read, so read it once. Reading it per pixel made builds take over 10 minutes.
  - resvg ignores `font-weight` with the variable Arimo font, so bold is faked with a stroke (`bold()`).
- Text wrapping measures widths from the advance table in `kindle/lib/glyphs.ts`, which is generated from Arimo at 26 px.
- The Tempelhof build checks its schedule against `getTemplehofStatus` every 7 minutes for a year and fails on any mismatch. Countdown minutes are rounded up on the device.

## Device loop (`kindle/device/dashboard.sh`, installed to `/mnt/us/dashboard`)

- **Schedule**: the loop resolves the current slot from `SCHEDULE` (from `state.env`, written at check-in; the default is built in). The slot before the first entry continues the previous day's last slot, so after midnight the evening listing is still the one for the previous date.
- **Tempelhof slot**: it wakes every minute. **Kino slot**: one full draw, then sleep until the next switch.
- **Daily check**: at the first wake at or after 06:00, it checks in only if `kino/<today>.png` or `kino/<tomorrow>.png` is missing.
- **Waking**: it sets `/sys/class/rtc/rtc1/wakealarm` to `+N`, then runs `echo mem > /sys/power/state`.
  - After a timer wake, `wakealarm` reads empty. If it still holds the pending alarm, something else woke the Kindle: with USB charging, the loop exits; otherwise it was the power button, and the loop checks in. Scripts cannot see power-button key events on this model.
- **Interface**: the loop stops `lab126_gui` and `webreader` on every loop. It must not stop `framework` directly, because that kills the power button. Restarting `lab126_gui` on exit reloads the whole UI, which looks like a reboot; `powerd` returns to `active` by itself.
- **Wi-Fi**: it uses `lipc-set-prop com.lab126.wifid enable 0/1` and waits for `cmState` = `CONNECTED`. Wi-Fi is on only during check-ins.
- **Time**: the Kindle's own zone setting is garbage, so the script uses the POSIX rule `CET-1CEST,M3.5.0,M10.5.0/3`. Busybox has `date -d @<epoch>` and `date -d "YYYY-MM-DD HH:MM"`. Clock drift against the hub is logged, not corrected.
- **Launching**: there is no KUAL, which is obsolete on WinterBreak 2. The books are scriptlets in `/mnt/us/documents/*.sh`. sh_integration runs them as root through `/var/local/mkk/su` and waits for them to exit, so the start books detach with `setsid ... &`. A script's output is shown on screen through FBInk unless it has a `# DontUseFBInk` header. Run `lipc-set-prop com.lab126.scanner doFullScan 1` after adding books over SSH.
- **Access for testing**: KOReader's SSH server listens on port 2222 as root, with keys in `koreader/settings/SSH/authorized_keys`, and keeps running after KOReader exits. Kindle Wi-Fi dozes, so retry a first "No route to host". While the dashboard runs, Wi-Fi is off and SSH is unreachable. `dashboard.sh once` draws the current screen without suspending. `dashboard.sh checkin` checks in manually. `/mnt/us/dashboard/dashboard.log` (UTC) records each start, the battery level hourly, every check-in and each exit reason.

## Conventions

- Work is tracked in phases: the README has a checklist, and commit messages say "Phase N". When a phase lands, update the README.
- Modules open with a `// ====` (or `# ====` in shell) banner comment that describes the module and its phase.
