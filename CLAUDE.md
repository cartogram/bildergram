# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A battery-powered e-ink dashboard on two jailbroken Kindles: `kindle_01` (**Matt**), a Paperwhite 3, and `kindle_02` (**Fiona**), a Paperwhite 2. Each shows one **German screen** (the admin page stays in English), set per Kindle on the hub (Phase 15 dropped the daily schedule). Since Phase 17 each Kindle has its own screen on a 3 × 3 grid, read from the right (the bottom row is free for now): **`matt`** is Matt's exercise rings, tonight's films at the Yorck cinemas, and the date over the Tempelhofer Feld gauge; **`fiona`** is Fiona's rings, the weather, and the date over a small Ausdruck des Tages. Tiles change with the time of day themselves (the Feld countdown, tomorrow's films from 22:00).

There are three parts:
- **Kindle** (`kindle/device/dashboard.sh`): a busybox shell loop. It draws each screen's downloaded base image with `eips`, pastes the Feld tile (panel, countdown, gauge) on top, and suspends to RAM with Wi-Fi off, waking on the RTC alarm.
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

# test the device loop's day/check-in logic locally (it falls back to BSD date on macOS)
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
  - primitives: `text`, `width`/`exactWidth`/`fitSize`;
  - **the tile grid (Phase 14)**: `GRID` (Phase 17: 3 × 3 cells of 468 × 344, 8 apart, 14 from the sides and 12 from top and bottom; tiles draw their content at `GRID.scale` = 4/3, so a small tile's content is 303 × 210 and a medium's 303 × 474 in drawing units, the sizes the modules were designed for, and every token shows 4/3 larger on screen: body 36 at 48. `T()`/`boxSvg()` apply it, `toScreen(b, rect)` turns a content rect into screen pixels), `cell(col, row, cols, rows)`, `TILE_PAD` (24), and `tile(rect, style)` with styles `outline`, `light` (light gray border), `fill` (light gray), `dark` (black; modules switch to `TILE_INK_DARK`) and `bleed` (no container);
  - **tile sizes (Phase 16)**: `TILE_SIZES` names spans: `small` 1 × 1 (datum, Feld, the small Ausdruck), `medium` 1 × 2 (wetter, kino, fitness), `tall` 1 × 3 (a full column: kino), `large` 2 × 2. `T()` sets a tile's `size` from its span and throws unless the module's `sizes` export includes it; modules read `box.size`. Size is separate from `variant` (content choices such as wetter's `mixed`/`details`/`days`);
  - tile tokens: `TILE_TYPE` (display 104 bold, heading 36 bold and body 36, both with a `lead` of 48 (the cards' German lines, the large Kino listing), label 28 bold with a `lead` of 38 (a wrapped title, such as the card's English meaning), small 24; there is no 32), `TILE_INK` (ink, muted, faint, line on paper), `firstBaseline(size)` (every tile's first line has its capitals 8 px below the content top; last lines sit on the bottom edge), `pill()` and `circleLabel()` (24 bold in a 32-high shape), `statRow()` (label left, bold value right, 38 apart);
  - **the ellipsis (Phase 16)**: `ELLIPSIS` (three periods set 1/14 em closer, about two thirds of the "…" glyph) and `clipText(x, y, str, style, w)`, which cuts a line mid-word to end in it, measured with `exactWidth()` so the dots end at `x + w`;
  - German formatting: `deDateLong`, `deNumber` (decimal comma, typographic minus), `deCountdown`;
  - the WMO weather icons and German weather texts.

  New UI should use these rather than raw sizes or colors. The **Design** page shows them: `kindle/lib/specimens.mjs` holds the tokens as data (`designTokens`, with what each is for) and every specimen as SVG (`designSpecimens`: grid, type, inks, components, every card in each state; sample data from `kindle/lib/samples.mjs`). Two pages use it, so they can't drift: `npm run kindle:design` (`kindle/design.mjs` → `kindle/dist/gallery/design.html`) and the admin page's Design tab (`#design`), through the hub's `/api/admin/design` (`src/routes/design.ts`) and the renderer's `api/design.mjs` (JSON, or `?specimen=n` → PNG; data cached 10 min). The large Kino listing is `TILE_TYPE.body`, `body.lead` (48) apart; the weather's next days are set like the exercise legend (label and stat values, `STAT.lead` apart). Bold is the real **Arimo Bold** (`assets/fonts/Arimo-Bold.ttf`), and `width()` assumes bold runs ≤ 7% wider than regular (it overestimates, by about 6% on GESCHLOSSEN). `exactWidth()` uses Arimo Bold's measured advances instead; use it only where drawing must end with the text, such as an underline, because switching layout to it would shift sizes and line breaks. Modules draw in their content box, origin top left (`moduleBox`).
- **`modules/*.mjs`**: each module exports `render(box, data, …)`, which returns SVG in box-local coordinates, plus its `cadence`.
  - `datum` (Phase 14) is the date tile: weekday, day, month, and Akku in a pill; it sits in cell (0, 0) on every screen because the check-in's "Aktualisiere …" piece (`updatingRect`) is pasted there.
  - `tempelhof` is per-minute and drawn on the device; it also exports `countdownBox` and `countdownSvg`. The 2 × 1 tile is "Feld schließt in" over the countdown plus a half-circle gauge (`GAUGE_STEPS` dots from the last event to the next, times in pills); open draws the ring as an "n" above the text, closed as a "u" below, so countdown and gauge pieces are placed per state (`gaugeBox`, `gaugeSvg`, `gaugeStep`).
  - `wetter` is hourly (Open-Meteo, no key; 2 × 2 variants `mixed`, `details` and `days`).
  - `kino` is daily (yorck.de), medium, tall or large; the tile lists every cinema by time with a letter per cinema, and from 22:00 Berlin time shows tomorrow's listing (`render.mjs` `kinoDay`). Large has one row per screening and "heute ab 18:00"; medium has just "heute"/"morgen" and one line per screening, `STAT.lead` apart (the time in `label`, the title at 28 regular in faint ink, cut mid-word just short of the cinema letter); tall (a full column) has two lines per screening: the time with its language version beside it (`VERSIONS`: OV, OmU, OmeU, OmdU, DF; yorck.de's series tags are left out) and the letter, then the title on its own line.
  - `ausdruck` is daily, from `kindle/data/ausdruecke.json`: 365 B2 entries `{ausdruck, bedeutung, beispiel}`, rotating by days since 2026-01-01.
  - `praeposition` is daily, from `kindle/data/praepositionen.json`: 215 verbs with a fixed preposition `{wort, kasus, bedeutung, beispiel}`, contrasting pairs on neighbouring days; drawn with the `ausdruck` band layout.
  - `fitness` is hourly: exercise minutes per person against day, week and year goals; the `person` tile draws three rings (today, the week as one segment per day, the year) and a legend. The data comes from the hub (the renderer's `fitness` param, validated by `parseFitness`), not from a fetch.
  - The `ausdruck` card (small, medium or large) centres the English meaning (as title), the expression and the example (small, the word of the day: the meaning and the expression only); the example's Wörter (`kindle/data/woerter.json`, by entry index: `[{artikel, wort, plural} | {verb, formen}]`, plurals written out, generated and spot-checkable) flow at the bottom. `praeposition` uses the same card. `fit(box, entry)` lays it out: the text shrinks to 80 % rather than overflow or cut a line short; Wörter are dropped when a group is wider than the card, and on medium unless they fit whole at full size; medium drops the example as a last resort. `kindle:build` checks every Ausdruck and Präposition at each size and fails on any that don't fit.
- **`screens.mjs`**: `SCREENS` (tiles from `T(module, [col, row, cols, rows], { variant, tone })`; `matt` and `fiona`; the date `DATE` is at (0, 0) on every screen, and the Feld `FELD`, where a screen has it, at (0, 1), so screens share one Kindle piece set, `feld`), `moduleSvg(b, data, mode)` and `screenSvg(id, data, mode)`, where `mode` is one of:
  - `full`: everything; used by the gallery and the admin preview.
  - `base`: device boxes left blank; this is what the server sends to the Kindle.
  - `fallback`: "Keine Verbindung" placeholders, prebuilt for offline use.

  `DEVICE_MODULES` (tempelhof) and `HOURLY_SCREENS` (screens with an hourly module: `wetter`, `fitness`) are derived from the screens. To add a screen, edit `SCREENS` here **and** in `src/routes/kindle.ts`.
- **`render.mjs`**: `screenData` fetches only what a screen's modules need; `renderScreen` produces the PNG.

## Devices and images

- **Devices**: `kindle/lib/devices.mjs` holds each panel's landscape size and rotation (`kindle_01`: 1448×1072, `kindle_02`: 1024×758). `src/devices.ts` holds tokens and MACs; keep the ids in sync. Screens are designed on the 1448×1072 canvas and rasterized at the device width (`rasterize(svg, { width })` uses resvg's `fitTo`).
- **Tempelhof pieces at a fractional scale**: pieces are **cropped from full-canvas renders** at the device width. Rendering only a region through a shifted viewBox anti-aliases differently at fractional scales (up to 119 gray levels off), which broke the pixel-exact paste check. `pixelRect` rounds box rects outward to whole device pixels.

- **Format**: the framebuffer is 1072×1448 **portrait**, 8 bpp gray (`eips -i`). `eips -g` pastes pixels as-is, with no scaling, rotation or depth conversion. So everything is drawn as a 1448×1072 landscape SVG, quantized to 16 grays, rotated counter-clockwise (`KINDLE_ROTATE=cw` flips it), and written as an 8-bit grayscale PNG; 1-bit PNGs display wrongly. The paste positions in the generated `layout.env` are portrait coordinates (`TP_<screen>_X`, `CD_<screen>_X`, `GG_<screen>_<state>_X`, `UPD_X`, …).
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
  - **Config**: `{screen, kino:{cinemas,from,letterboxdUser,hideSeen,hiddenFilms}, checkinMinutes (15–360), exit}`, `screen` one of `SCREENS` (also in `kindle/lib/screens.mjs`; the default is `matt` for `kindle_01` and `fiona` for `kindle_02`, as `screen` in `kindle/lib/devices.mjs`; a saved screen that no longer exists, such as `home`, falls back to it). `hiddenFilms` holds Yorck film slugs. Older configs (with a `schedule`) are migrated on read.
  - **Check-in** (`POST /api/kindle/checkin`): the body is the device's log tail. The reply is shell-safe `KEY="value"` lines (`SCREEN="matt"`, `CHECKIN_MINUTES`, `EXIT`, `SERVER_TIME`). The Kindle validates them with a regex before sourcing, so keep values within `[A-Za-z0-9 :._-]`.
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

- **The screen and the day**:
  - The loop shows `SCREEN` (from the hub, kept in `state.env` with `CHECKIN_MINUTES` and `LAST_OK`; `DEFAULT_SCREEN` from `layout.env` until then). `resolve_day` sets today's date and the next midnight, when it wakes for a new day's base.
  - The base is stored as `screens/<id>.png` plus `.day`. Without a base for today, the loop draws `fallback/<id>.png`.
- **When it checks in**:
  - when today's base is missing (at start, and after midnight);
  - every `CHECKIN_MINUTES` (the screen has hourly cards);
  - on the power button.

  After a failure it waits `RETRY_SECS` (15 min) before trying again. Each check-in downloads the screen's base for today.
- **Tempelhof box**:
  - The loop pastes `tempelhof/<variant>/panel/<state>.png` (the whole tile, background included) on full redraws (state changes, and every 15 minutes against ghosting).
  - It pastes `cd/<open|closed>/<minutes>.png` every minute; minutes are rounded up.
  - Where the tile has a gauge (`GG_<screen>_<state>_X`), it pastes `gauge/<state>/<since>-<target>/<step>.png` when the step changes; `tempelhof_lookup` returns the previous event and the pair of times too.
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
  - `dashboard.log` timestamps are UTC (`date -u`); the screen and its day use Berlin time.
- **Hardware**: Matt (`kindle_01`, 192.168.0.93) is a Paperwhite 3: 1072×1448 portrait framebuffer, firmware 5.13.7. Fiona (`kindle_02`, 192.168.0.198) is a Paperwhite 2: 758×1024 portrait framebuffer at 212 ppi, `line_length` 768 (padded rows, which eips handles), firmware 5.12.2.1.1. They share a case, so tell them apart by serial prefix (G090G1 = PW3, 90D4 = PW2). WinterBreak2 covers both.

## Conventions

- Work is tracked in phases: the README has a checklist, and commit messages say "Phase N". When a phase lands, update the README.
- Modules open with a `// ====` (or `# ====` in shell) banner comment that describes the module and its phase.
