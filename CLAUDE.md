# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A battery-powered e-ink dashboard on two jailbroken Kindles: `kindle_01` (**Matt**), a Paperwhite 3, and `kindle_02` (**Fiona**), a Paperwhite 2. Each shows **German screens** (the admin page stays in English) on its own daily schedule: **Morgen** (weather + expression of the day), **Tag** (Tempelhof countdown + Präposition des Tages + weather), **Abend** (IM KINO, the Yorck cinema listing) and **Nacht** (exercise this week for Matt and Fiona + expression of the day).

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
npm run kindle:build     # per device: Tempelhof pieces, fallbacks, layout.env, paste check → kindle/dist/<device> (~25 s)
KINDLE_DEVICE=kindle_01 KINDLE_HOST=<ip> npm run kindle:install   # or KINDLE_VOLUME=/Volumes/Kindle (USB drive); add KINDLE_HUB_URL/KINDLE_HUB_TOKEN(/KINDLE_HUB_MAC over USB) to (re)write hub.env
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
  - primitives: `text`, `label`, `pill` (open: GEÖFFNET), `underlined` (the same word in black with a thick rule under it; closed: GESCHLOSSEN), rules, `topbar` (date + battery);
  - German formatting: `deDateLong`, `deNumber` (decimal comma, typographic minus), `deCountdown`;
  - the WMO weather icons and German weather texts.

  - **Section titles are off** (`SECTION_TITLES`): modules still lay out under a title line, so `screens.mjs` (`moduleBox`) and the build render each module `TITLE_SPACE` (64) taller and shifted up by it. Modules draw titles only through `sectionTitle()`.

  New UI should use these rather than raw sizes or colors. `npm run kindle:design` renders every token, primitive, icon and module variant to `kindle/dist/gallery/design-system.html`. Bold is the real **Arimo Bold** (`assets/fonts/Arimo-Bold.ttf`), and `width()` assumes bold runs ≤ 7% wider than regular (it overestimates, by about 6% on GESCHLOSSEN). `exactWidth()` uses Arimo Bold's measured advances instead; use it only where drawing must end with the text, such as an underline, because switching layout to it would shift sizes and line breaks.
- **`modules/*.mjs`**: each module exports `render(box, data, …)`, which returns SVG in box-local coordinates, plus its `cadence`.
  - `tempelhof` is per-minute and drawn on the device; it also exports `countdownBox` and `countdownSvg`.
  - `wetter` is hourly (Open-Meteo, no key; variants `compact` and `wide`).
  - `kino` is daily (yorck.de).
  - `ausdruck` is daily, from `kindle/data/ausdruecke.json`: 365 B2 entries `{ausdruck, bedeutung, beispiel}`, rotating by days since 2026-01-01.
  - `praeposition` is daily, from `kindle/data/praepositionen.json`: 215 verbs with a fixed preposition `{wort, kasus, bedeutung, beispiel}`, contrasting pairs on neighbouring days; drawn with the `ausdruck` band layout.
  - `fitness` is hourly: this week's exercise minutes per person against a weekly goal. The data comes from the hub (the renderer's `fitness` param, validated by `parseFitness`), not from a fetch.
- **`screens.mjs`**: `SCREENS` (frame flags, boxes, rules) and `screenSvg(id, data, mode)`, where `mode` is one of:
  - `full`: everything; used by the gallery and the admin preview.
  - `base`: device boxes left blank; this is what the server sends to the Kindle.
  - `fallback`: "Keine Verbindung" placeholders, prebuilt for offline use.

  `DEVICE_MODULES` (tempelhof) and `HOURLY_SCREENS` (screens with an hourly module: `wetter`, `fitness`) are derived from the screens. To add a screen, edit `SCREENS` here **and** in `src/routes/kindle.ts`.
- **`render.mjs`**: `screenData` fetches only what a screen's modules need; `renderScreen` produces the PNG.

## Devices and images

- **Devices**: `kindle/lib/devices.mjs` holds each panel's landscape size and rotation (`kindle_01`: 1448×1072, `kindle_02`: 1024×758). `src/devices.ts` holds tokens and MACs; keep the ids in sync. Screens are designed on the 1448×1072 canvas and rasterized at the device width (`rasterize(svg, { width })` uses resvg's `fitTo`).
- **Tempelhof pieces at a fractional scale**: pieces are **cropped from full-canvas renders** at the device width. Rendering only a region through a shifted viewBox anti-aliases differently at fractional scales (up to 119 gray levels off), which broke the pixel-exact paste check. `pixelRect` rounds box rects outward to whole device pixels.

- **Format**: the framebuffer is 1072×1448 **portrait**, 8 bpp gray (`eips -i`). `eips -g` pastes pixels as-is, with no scaling, rotation or depth conversion. So everything is drawn as a 1448×1072 landscape SVG, quantized to 16 grays, rotated counter-clockwise (`KINDLE_ROTATE=cw` flips it), and written as an 8-bit grayscale PNG; 1-bit PNGs display wrongly. The paste positions in the generated `layout.env` are portrait coordinates (`TP_<screen>_X`, `CD_<screen>_X`, `UPD_X`, …).
- **resvg-wasm gotchas**:
  - `img.pixels` is a getter that copies out of WASM memory on every read, so read it once; reading it per pixel made builds take over 10 minutes.
  - Call `img.free()` and `resvg.free()` after each render. Without that, a build of about 1,000 full renders crashed WASM (`RuntimeError: unreachable`), and long-lived Vercel instances would leak memory.
  - resvg can't pick weights from the variable `Arimo.ttf`, which is why `Arimo-Bold.ttf` is loaded alongside it.
- **Measuring text**: wrapping measures widths from the advance table in `kindle/lib/glyphs.ts`, which is generated from Arimo at 26 px. The same generator also writes `BOLD_ADVANCES` (Arimo Bold, to 1/100 px) for `exactWidth()`.
- **Imports**: `eink.mjs` and the build import `glyphs.ts` and `templehof.ts` through Node's native type stripping, both on Vercel and locally. Keep those files free of imports and of non-erasable TS syntax.

## Hub (`src/`)

- **Routing** (`worker.ts`): only `/api/kindle/*`, `/api/fitness`, `/api/admin/kindle*` and `/api/admin/fitness` are handled. `state.ts` holds the shared R2 JSON helpers and the admin check.
  - Device requests use `Access-Token` = the device's `DEVICE_TOKEN_KINDLE_0x`, with an optional `ID` header carrying the MAC (not checked while a device's MAC is still `""`).
  - Admin requests use `Authorization: Bearer ADMIN_TOKEN`, with `?device=` defaulting to `kindle_01`.
  - Other `/api/*` paths return 404; everything else is the SPA.
  - There are no cron triggers: the explicit empty `crons` list in `wrangler.jsonc` also clears old schedules on deploy.
- **`routes/kindle.ts`**:
  - **The Kindles never show the same screen at once**: saving a schedule that clashes with another Kindle's at any time is refused (`firstClash`). Defaults: Matt 06:00 morgen, 09:00 tag, 18:15 abend, 23:00 nacht; Fiona 09:00 morgen, 18:15 nacht, 23:00 tag (also in `kindle/lib/devices.mjs` for `DEFAULT_SCHEDULE`).
  - **Config**: `{schedule:[{at,screen}], kino:{cinemas,from,letterboxdUser,hideSeen,hiddenFilms}, checkinMinutes (15–360), exit}`. `hiddenFilms` holds Yorck film slugs. Phase 7 configs (screens `tempelhof`/`kino`) are migrated on read.
  - **Check-in** (`POST /api/kindle/checkin`): the body is the device's log tail. The reply is shell-safe `KEY="value"` lines (`SCHEDULE="0600:morgen 0900:tag …"`, `CHECKIN_MINUTES`, `EXIT`, `SERVER_TIME`). The Kindle validates them with a regex before sourcing, so keep values within `[A-Za-z0-9 :._-]`.
  - The `exit` flag is one-shot: it is cleared once sent.
  - **Status** keeps a week of `[epoch, battery]` history.
  - **Screen images**: `GET /api/kindle/screen/<id>.png?day=&battery=` → renderer. The admin preview (`/api/admin/kindle/screen?screen=`) is the full render.
- **Environment**: `RENDERER_URL` is a var in `wrangler.jsonc`. `ADMIN_TOKEN`, `RENDERER_TOKEN`, `DEVICE_TOKEN_KINDLE_01`, `DEVICE_TOKEN_KINDLE_02`, `FITNESS_TOKEN_MATT` and `FITNESS_TOKEN_FIONA` are secrets. `AppEnv` types the hub secrets as optional regardless of `.dev.vars`. State lives in R2 per device (`kindle/<device>/*.json`, in the bucket still named `trmnl-display-assets`). The renderer gets `device=` so each Kindle downloads screens at its size.
- **Admin SPA** (`src/client/main.ts`): keeps the token in localStorage and loads images with `fetch` and object URLs, because they need the auth header.

- **`routes/fitness.ts`** (Phase 12):
  - `POST /api/fitness` with `Authorization: Bearer FITNESS_TOKEN_<PERSON>` (the token picks the person in `PEOPLE`). The body is one day per line, `YYYY-MM-DD minutes`, from an iPhone Shortcut; German dates, times after the date, decimal commas and JSON are accepted too.
  - iPhones only allow Health reads while unlocked, and a locked read is empty or all zeros. So each day keeps the **highest** value ever received, and `syncedAt` ("Stand" on the screen) only moves on a post with a nonzero value.
  - State: `fitness/<person>.json` (60 days, plus the last payload and result for the admin page) and `fitness/settings.json` (weekly goals, default 150). People are shared by both Kindles, not per device.
  - Screens in `FITNESS_SCREENS` (`nacht`) get `fitness=<json>` (that week's minutes, goals, `syncedAt`) on the renderer URL.

## Renderer and data sources

- **Endpoints**: `api/screen.mjs`, `GET ?screen=&device=&date=&battery=&cinemas=&from=[&letterboxd=&hide=][&fitness=<json>][&preview=1]`, and `api/films.mjs` (the coming days' films marked `seen`, for the admin page), protected by `x-renderer-token` = `RENDERER_TOKEN`. Failures are logged with `console.error`.
- **Bundling**: `vercel.json` sets `framework: null`, skips the Vite build, runs `npm install --omit=dev`, and lists fonts, WASM, `kindle/lib/**` and `kindle/data/*.json` under `includeFiles`. `.vercelignore` must keep `.dev.vars` and `.env*` out of uploads.
- **yorck.de**:
  - Each `/kinos/<slug>` page embeds its programme (~100 KB) in `__NEXT_DATA__` (`pageProps.filmsSpecials[].fields.sessions[]`, where `startTime` carries the Berlin offset).
  - The site stops listing a screening once it has started.
  - **Letterboxd filter** (`withoutSeen` in `kino.mjs`): `letterboxd.com/<user>/rss/` (public, recent diary only) lists logged films with `<tmdb:movieId>`, and each Yorck `/filme/<slug>` page has `film.fields.tmdbId`. Films match by id, because Yorck uses German titles; specials without an id are never hidden. A render looks up only that evening's films. TMDB ids are cached for the life of the process, and the feed for 10 minutes. The screen never shows how many films were hidden.
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
  - `dashboard.sh once [EPOCH]` draws the screen for that instant without suspending.
  - To see what is on the panel, read `/dev/fb0` over SSH (`dd bs=<line_length> count=<yres>`) **right after** drawing: while KOReader is open it repaints its own UI over eips output within seconds.
  - `dashboard.log` timestamps are UTC (`date -u`); the screens and schedule use Berlin time.
- **Hardware**: Matt (`kindle_01`, 192.168.0.93) is a Paperwhite 3: 1072×1448 portrait framebuffer, firmware 5.13.7. Fiona (`kindle_02`, 192.168.0.198) is a Paperwhite 2: 758×1024 portrait framebuffer at 212 ppi, `line_length` 768 (padded rows, which eips handles), firmware 5.12.2.1.1. They share a case, so tell them apart by serial prefix (G090G1 = PW3, 90D4 = PW2). WinterBreak2 covers both.

## Conventions

- Work is tracked in phases: the README has a checklist, and commit messages say "Phase N". When a phase lands, update the README.
- Modules open with a `// ====` (or `# ====` in shell) banner comment that describes the module and its phase.
