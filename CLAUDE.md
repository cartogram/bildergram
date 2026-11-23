# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A battery-powered e-ink dashboard on a jailbroken Kindle Paperwhite 3. It shows **German screens** (the admin page stays in English) on a daily schedule: **Morgen** (weather + expression of the day), **Tag** (Tempelhof countdown + weather), **Abend** (IM KINO, the Yorck cinema listing) and **Nacht** (expression of the day).

There are three parts:
- **Kindle** (`kindle/device/dashboard.sh`): a busybox shell loop. It draws each screen's downloaded base image with `eips`, pastes the Tempelhof panel and countdown on Tag, and suspends to RAM with Wi-Fi off, waking on the RTC alarm.
- **Hub** (`src/`): a Cloudflare Worker on the **free plan** (10 ms CPU per request). It holds the config and status (with battery history) in R2, serves the admin SPA, and passes screen images through from Vercel.
- **Renderer** (`api/screen.mjs`): a Vercel function (project `bildergram-kino`, team `matt-seccafiens-projects`, deployed on every push to `main`) that renders each screen's base PNG.

Screens are **bespoke layouts built from shared modules**, not a generic layout engine; expect about 5 screens. Everything visual lives in `kindle/lib/` and is shared by the build, the gallery and Vercel.

## Commands

```bash
npm run dev              # Worker + admin SPA in workerd (secrets from .dev.vars)
npm run renderer:dev     # local stand-in for the Vercel function on :3999 (.dev.vars points RENDERER_URL here)
npm run kindle:gallery   # all screens from live data → kindle/dist/gallery/index.html (design review)
npm run kindle:build     # Tempelhof pieces, fallbacks, layout.env, paste check → kindle/dist (~10 s)
KINDLE_HOST=<ip> npm run kindle:install   # copy kindle/dist to the Kindle (add KINDLE_HUB_URL/KINDLE_HUB_TOKEN to (re)write hub.env)
npm run lint             # tsc for src/ and kindle/lib/*.ts
npx tsc --noEmit -p src/client   # the admin SPA (DOM lib), not covered by lint
npm run deploy           # vite build + wrangler deploy (the Worker; NOT deployed by git push)
vercel deploy --prod     # the renderer (also deployed by the GitHub integration on push)
npm run types            # regenerate worker-configuration.d.ts after changing wrangler.jsonc or .dev.vars
npm run glyphs           # regenerate kindle/lib/glyphs.ts (0.4 s)

# test the device loop's schedule/check-in logic locally (it falls back to BSD date on macOS)
DASHBOARD_DIR=$PWD/kindle/dist/dashboard dash kindle/device/dashboard.sh plan <epoch>
```

There is no test runner. Verify changes with:
- the typechecks, and `dash -n` on the shell scripts;
- `kindle:build`, whose schedule check and pixel-exact paste check fail the build on any mismatch;
- `plan` mode;
- the gallery;
- curl against `npm run dev` + `npm run renderer:dev`, using the tokens in `.dev.vars`.

## Screens and modules (`kindle/lib/`)

- **`design.mjs`** is the design system. It holds:
  - tokens: `TYPE` scale, `INK` (three levels that land exactly on the panel's 16 grays), `MARGIN`/`CONTENT`, `RULE`;
  - primitives: `text`, `label`, `pill`, rules, `topbar` (date + battery);
  - German formatting: `deDateLong`, `deNumber` (decimal comma, typographic minus), `deCountdown`;
  - the WMO weather icons and German weather texts.

  New UI should use these rather than raw sizes or colors. Bold is the real **Arimo Bold** (`assets/fonts/Arimo-Bold.ttf`), and `width()` assumes bold runs ≤ 7% wider than regular.
- **`modules/*.mjs`**: each module exports `render(box, data, …)`, which returns SVG in box-local coordinates, plus its `cadence`.
  - `tempelhof` is per-minute and drawn on the device; it also exports `countdownBox` and `countdownSvg`.
  - `wetter` is hourly (Open-Meteo, no key; variants `compact` and `wide`).
  - `kino` is daily (yorck.de).
  - `ausdruck` is daily, from `kindle/data/ausdruecke.json`: 365 B2 entries `{ausdruck, bedeutung, beispiel}`, rotating by days since 2026-01-01.
- **`screens.mjs`**: `SCREENS` (frame flags, boxes, rules) and `screenSvg(id, data, mode)`, where `mode` is one of:
  - `full`: everything; used by the gallery and the admin preview.
  - `base`: device boxes left blank; this is what the server sends to the Kindle.
  - `fallback`: "Keine Verbindung" placeholders, prebuilt for offline use.

  `DEVICE_MODULES` (tempelhof) and `HOURLY_SCREENS` (screens containing `wetter`) are derived from the screens. To add a screen, edit `SCREENS` here **and** in `src/routes/kindle.ts`.
- **`render.mjs`**: `screenData` fetches only what a screen's modules need; `renderScreen` produces the PNG.

## Images for the Paperwhite 3

- **Format**: the framebuffer is 1072×1448 **portrait**, 8 bpp gray (`eips -i`). `eips -g` pastes pixels as-is, with no scaling, rotation or depth conversion. So everything is drawn as a 1448×1072 landscape SVG, quantized to 16 grays, rotated counter-clockwise (`KINDLE_ROTATE=cw` flips it), and written as an 8-bit grayscale PNG; 1-bit PNGs display wrongly. The paste positions in the generated `layout.env` are portrait coordinates (`TP_<screen>_X`, `CD_<screen>_X`, `UPD_X`, …).
- **resvg-wasm gotchas**:
  - `img.pixels` is a getter that copies out of WASM memory on every read, so read it once; reading it per pixel made builds take over 10 minutes.
  - resvg can't pick weights from the variable `Arimo.ttf`, which is why `Arimo-Bold.ttf` is loaded alongside it.
- **Measuring text**: wrapping measures widths from the advance table in `kindle/lib/glyphs.ts`, which is generated from Arimo at 26 px.
- **Imports**: `eink.mjs` and the build import `glyphs.ts` and `templehof.ts` through Node's native type stripping, both on Vercel and locally. Keep those files free of imports and of non-erasable TS syntax.

## Hub (`src/`)

- **Routing** (`worker.ts`): only `/api/kindle/*` and `/api/admin/kindle*` are handled.
  - Device requests use `Access-Token` = `DEVICE_TOKEN_KINDLE_01`, with an optional `ID` header carrying the MAC.
  - Admin requests use `Authorization: Bearer ADMIN_TOKEN`.
  - Other `/api/*` paths return 404; everything else is the SPA.
  - There are no cron triggers: the explicit empty `crons` list in `wrangler.jsonc` also clears old schedules on deploy.
- **`routes/kindle.ts`**:
  - **Config**: `{schedule:[{at,screen}], kino:{cinemas,from}, checkinMinutes (15–360), exit}`. Phase 7 configs (screens `tempelhof`/`kino`) are migrated on read.
  - **Check-in** (`POST /api/kindle/checkin`): the body is the device's log tail. The reply is shell-safe `KEY="value"` lines (`SCHEDULE="0600:morgen 0900:tag …"`, `CHECKIN_MINUTES`, `EXIT`, `SERVER_TIME`). The Kindle validates them with a regex before sourcing, so keep values within `[A-Za-z0-9 :._-]`.
  - The `exit` flag is one-shot: it is cleared once sent.
  - **Status** keeps a week of `[epoch, battery]` history.
  - **Screen images**: `GET /api/kindle/screen/<id>.png?day=&battery=` → renderer. The admin preview (`/api/admin/kindle/screen?screen=`) is the full render.
- **Environment**: `RENDERER_URL` is a var in `wrangler.jsonc`. `ADMIN_TOKEN`, `RENDERER_TOKEN` and `DEVICE_TOKEN_KINDLE_01` are secrets. `AppEnv` types the hub secrets as optional regardless of `.dev.vars`. State lives in R2 (`kindle/kindle_01/*.json`, in the bucket still named `trmnl-display-assets`).
- **Admin SPA** (`src/client/main.ts`): keeps the token in localStorage and loads images with `fetch` and object URLs, because they need the auth header.

## Renderer and data sources

- **Endpoint**: `api/screen.mjs`, `GET ?screen=&date=&battery=&cinemas=&from=[&preview=1]`, protected by `x-renderer-token` = `RENDERER_TOKEN`. Failures are logged with `console.error`.
- **Bundling**: `vercel.json` sets `framework: null`, skips the Vite build, runs `npm install --omit=dev`, and lists fonts, WASM, `kindle/lib/**` and `kindle/data/*.json` under `includeFiles`. `.vercelignore` must keep `.dev.vars` and `.env*` out of uploads.
- **yorck.de**:
  - Each `/kinos/<slug>` page embeds its programme (~100 KB) in `__NEXT_DATA__` (`pageProps.filmsSpecials[].fields.sessions[]`, where `startTime` carries the Berlin offset).
  - The site stops listing a screening once it has started.
  - A planned Letterboxd "already seen" filter matches films by TMDB id from the `/filme/<slug>` pages.
- **Open-Meteo**: `fetchWeather` asks for the current values plus 3 days of daily data for Tempelhofer Feld.

## Device loop (`kindle/device/dashboard.sh`, installed to `/mnt/us/dashboard`)

- **Screens and slots**:
  - The loop resolves the current screen from `SCHEDULE` (kept in `state.env` with `CHECKIN_MINUTES` and `LAST_OK`).
  - The slot before the first entry continues the previous day's last slot, so after midnight Nacht still shows the previous date.
  - Bases are stored as `screens/<id>.png` plus `.day`. Without a base for the slot's day, the loop draws `fallback/<id>.png`.
- **When it checks in**:
  - when the current base is missing;
  - every `CHECKIN_MINUTES` while an hourly (weather) screen is showing;
  - on the power button.

  After a failure it waits `RETRY_SECS` (15 min) before trying again. Each check-in downloads every scheduled screen: the current one for its slot's day, the others for today.
- **Tempelhof box**:
  - On Tag the loop pastes `tempelhof/<variant>/panel/<state>.png` on full redraws (state changes, and every 15 minutes against ghosting).
  - It pastes `cd/<minutes>.png` every minute; minutes are rounded up.
  - The schedule comes from `schedule.txt` (3 years; the build checks it against `getTemplehofStatus`).
- **Waking**: it sets `/sys/class/rtc/rtc1/wakealarm` to `+N`, then runs `echo mem > /sys/power/state`.
  - After a timer wake, `wakealarm` reads empty. If it still holds the pending alarm, the power button or USB woke the Kindle: with USB charging the loop exits, otherwise it checks in.
  - Scripts cannot see power-button key events on this model.
- **Interface**: the loop stops `lab126_gui` and `webreader` on every loop. It must not stop `framework` directly, because that kills the power button. Restarting `lab126_gui` on exit reloads the UI, which looks like a reboot.
- **Wi-Fi**: off except during check-ins. `wifi_restore` leaves it on if it was on before, so a manual `dashboard.sh checkin` over SSH doesn't cut the session.
- **Time**: the Kindle's own zone setting is garbage, so the loop uses the POSIX rule `CET-1CEST,M3.5.0,M10.5.0/3`. Check-ins correct the clock from `SERVER_TIME` when it is off by more than 10 s; it drifted about 1 minute a day with Wi-Fi off.
- **Launching**: there is no KUAL, which is obsolete on WinterBreak 2. The books are scriptlets in `/mnt/us/documents/*.sh`. sh_integration runs them as root through `/var/local/mkk/su` and waits for them to exit, so the start books detach with `setsid ... &`. A script's output is shown on screen through FBInk unless it has a `# DontUseFBInk` header. Run `lipc-set-prop com.lab126.scanner doFullScan 1` after adding books over SSH.
- **Access for testing**:
  - KOReader's SSH server listens on port 2222 as root, with keys in `koreader/settings/SSH/authorized_keys`, and keeps running after KOReader exits.
  - Kindle Wi-Fi dozes, so retry a first "No route to host".
  - While the dashboard runs, Wi-Fi is off; a check-in uploads the log tail to the hub, where the admin page shows it.
  - `dashboard.sh once` draws the current screen without suspending.
- **Hardware**: Kindle #1 is a Paperwhite 3 (1448×1072). Kindle #2 is a **Paperwhite 2** (758×1024 portrait framebuffer, 212 ppi, firmware 5.12.2.1.1; confirmed by the user). WinterBreak2 covers both. Everything here assumes 1448×1072; the PW2 has the same aspect ratio, so the same SVG can be rendered at 1024×758 (scaled viewBox), but paste positions and Tempelhof pieces must be computed per device size. Multi-device support in the hub and admin page is the next step.

## Conventions

- Work is tracked in phases: the README has a checklist, and commit messages say "Phase N". When a phase lands, update the README.
- Modules open with a `// ====` (or `# ====` in shell) banner comment that describes the module and its phase.
