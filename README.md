# bildergram

A battery-powered e-ink dashboard on two jailbroken Kindles, **Matt** (a
Paperwhite 3) and **Fiona** (a Paperwhite 2), in German. Each Kindle shows one
screen of tiles (both the same for now); the tiles change with the time of day
themselves:

| Tile | What it shows |
|---|---|
| **Datum** | The weekday, the date and the battery |
| **Tempelhofer Feld** | Open or closed, a countdown updated every minute, and a half-circle gauge from the last opening/closing to the next |
| **Wetter** | Now, today's high/low, precipitation and wind, the next three days |
| **Ausdruck des Tages** | A B2 expression: its English meaning, an example sentence and the example's words (article, plural, past forms) |
| **Im Kino** | The evening's screenings at your chosen [Yorck](https://www.yorck.de) cinemas, without films you've logged on Letterboxd; from 22:00 tomorrow's |
| **Matt, Fiona** | Exercise minutes from Apple Health as three rings: today, this week (a segment per day), this year |

The Kindle sleeps between updates with Wi-Fi off. It goes online on an
interval (default hourly) while a weather screen is showing, when it doesn't
have the current screen yet, and when you press its power button.

## How it works

```
┌──────────── Kindle Paperwhite 3 (kindle/device/dashboard.sh) ─────────────┐
│  draw the screen's base image; paste the Feld tile (panel, gauge) and a    │
│  countdown every minute (prebuilt) → suspend until the next wake (RTC)     │
└───────┬────────────────────────────────────────────────────────────────────┘
        │ check-in: battery + log up; screen + interval down; then the screen's base
        ▼
Cloudflare Worker hub (src/) ── config, status + battery history, admin page, R2 state
        │ GET /api/screen?screen=…
        ▼
Vercel function (api/screen.mjs) ── Open-Meteo, yorck.de, phrase list → screen PNG
```

- **Screens are built from modules.** `kindle/lib/screens.mjs` places modules
  in boxes on a shared frame (date and battery in the top bar):
  - `tempelhof`: every minute, drawn on the Kindle;
  - `wetter`: hourly, from Open-Meteo;
  - `kino`: daily, from the yorck.de cinema pages;
  - `ausdruck`: daily, from `kindle/data/ausdruecke.json`.
- **One design system.** `kindle/lib/design.mjs` holds the type scale, three
  ink levels tuned to the panel's 16 grays, spacing, Arimo Regular and Bold,
  the weather icons and German formatting (dates, decimal commas, "2 h 15 min").
- **The server renders everything except Tempelhof.** Rendering needs more
  CPU than the Workers free plan allows (10 ms), so a Vercel function draws
  each screen's base and the Worker only passes it through. The Tempelhof
  status depends only on the opening hours and the clock, so its images are
  prebuilt: `npm run kindle:build` writes the schedule for 3 years, a panel
  per state and a countdown per minute, and checks that the pasted pieces
  reproduce the design pixel for pixel.
- **One design, every device.** Screens are designed on a 1448 × 1072 canvas and
  rendered at each Kindle's size (`kindle/lib/devices.mjs`): the Paperwhite 2's
  1024 × 758 has the same shape, so the same SVG scales down. The build makes a
  bundle per device, and its paste check runs at each size.
- **The Worker is the hub.** It stores each Kindle's config and last check-in
  (with a week of battery readings) in R2 and serves the admin page. The
  Kindles only ever talk to the Worker.

### On the Kindle

| When | What happens |
|---|---|
| Start, and every midnight | Draw the screen (today's downloaded base, or a "Keine Verbindung" fallback) |
| Every minute | The Feld countdown changes; the gauge moves when its step does; a full redraw every 15 minutes clears ghosting |
| Every 60 min (configurable) | Check in: fresh weather, exercise and films, config changes |
| Today's base not downloaded yet | Check in (retries every 15 min if offline) |
| Power button | Check in now ("Aktualisiere …" on the date tile) |
| USB plugged in (or "Return to Kindle UI" on the admin page) | Exit to the normal Kindle UI, which reloads (it looks like a restart but isn't one) |

Three books in the Kindle library control it:

| Book | What it does |
|---|---|
| **Dashboard** | Starts the dashboard. |
| **Dashboard (30-min test)** | Same, but returns to the Kindle UI by itself after 30 minutes. |
| **Dashboard log** | Shows the end of `/mnt/us/dashboard/dashboard.log` on screen (times in UTC). |

## Setup

### 1. Vercel renderer

The function is `api/screen.mjs`; it reuses `kindle/lib/`. `vercel.json`
skips the Vite build and bundles the fonts, WASM and phrase list. The project
is `bildergram-kino` on the `matt-seccafiens-projects` team, linked to this
GitHub repo, so pushes to `main` deploy it.

```bash
vercel env add RENDERER_TOKEN production   # shared secret, also set on the Worker
vercel deploy --prod
```

### 2. Cloudflare Worker hub

```bash
npx wrangler secret put ADMIN_TOKEN             # for the admin page
npx wrangler secret put RENDERER_TOKEN          # same value as on Vercel
npx wrangler secret put DEVICE_TOKEN_KINDLE_01  # Matt's token (goes into its hub.env)
npx wrangler secret put DEVICE_TOKEN_KINDLE_02  # Fiona's token
npx wrangler secret put FITNESS_TOKEN_MATT      # Matt's iPhone Shortcut (see Fitness below)
npx wrangler secret put FITNESS_TOKEN_FIONA     # Fiona's iPhone Shortcut
npm run deploy
```

`RENDERER_URL` (the Vercel URL) is a plain var in `wrangler.jsonc`. The R2
bucket `trmnl-display-assets` holds the hub state per Kindle
(`kindle/<device>/config.json`, `status.json`).

### 3. Kindle

Requires a jailbroken Kindle (WinterBreak2: Matt is on firmware 5.13.7, Fiona on 5.12.2.1.1) and
KOReader, whose SSH server is used for installing: KOReader → gear →
Network → tick **SSH server** (port 2222; put your public key in
`koreader/settings/SSH/authorized_keys`).

```bash
npm run kindle:build                      # bundles for every device in kindle/dist/<device>
KINDLE_DEVICE=kindle_01 \
KINDLE_HOST=192.168.0.93 \
KINDLE_HUB_URL=https://bildergram.distance.workers.dev \
KINDLE_HUB_TOKEN=<DEVICE_TOKEN_KINDLE_01> \
npm run kindle:install
```

Or, with the Kindle in USB drive mode, `KINDLE_VOLUME=/Volumes/Kindle` instead of
`KINDLE_HOST` (then also `KINDLE_HUB_MAC`, its Wi-Fi MAC, when writing hub settings).
Use `KINDLE_DEVICE=kindle_02` and its token for Fiona, the Paperwhite 2.

The hub settings are written to `/mnt/us/dashboard/hub.env` and kept across
later installs, so `KINDLE_HOST=… npm run kindle:install` is enough after the
first time. Rebuild and reinstall before the Tempelhof schedule runs out
(3 years after the build), or after changing the hours in
`kindle/lib/templehof.ts`. If the screen shows upside down, build with
`KINDLE_ROTATE=cw`.

## Admin page

The Worker URL (https://bildergram.distance.workers.dev) serves the admin page
(in English). It asks once for `ADMIN_TOKEN`; a switcher picks the Kindle, and for
each it shows:

- the last check-in (time, battery, screen, version, recent log) and a
  battery chart for the last week;
- which screen it shows and the check-in interval;
- the cinemas for IM KINO and the first screening time to list;
- a Letterboxd username and a switch to leave out films you've logged there (matched by
  TMDB id from your public feed), plus the coming days' films with a manual hide
  checkbox each;
- a one-shot **Return to the normal Kindle UI** switch;
- a live preview of each screen, at that Kindle's size.

For both Kindles it also shows each person's weekly exercise goal, this week's
minutes, when their iPhone last synced and what it last sent.

Changes reach the Kindle at its next check-in; press its power button to apply
them right away.

## Fitness (iPhone Shortcut)

Nacht shows this week's **exercise minutes** (the green ring in Apple Fitness)
for Matt and Fiona. Each iPhone sends them to the hub with a Shortcut, using its
own token (`FITNESS_TOKEN_MATT` / `FITNESS_TOKEN_FIONA`), which tells the hub whose
minutes they are.

iPhones only let Health data be read while they are **unlocked**; a locked read
comes back empty or as zeros. The hub keeps each day's highest value, so a bad
read never wipes real minutes, and "Stand" on the screen only moves on a read
with real minutes.

**The Shortcut** (Shortcuts → +), about six actions:

1. **Find Health Samples** where *Type* is *Exercise Minutes* and *Start Date* is
   in the last *7 days*; *Group By*: *Day*.
2. **Repeat with Each** item in *Health Samples*, containing:
   - **Format Date**: *Repeat Item → Start Date*, Date Format *Custom*, `yyyy-MM-dd`;
   - **Text**: *Formatted Date*, a space, *Repeat Item → Value*.
3. **Combine Text**: *Repeat Results* with *New Lines*. The result looks like
   `2026-11-24 35`, one line per day.
4. **Get Contents of URL**: `https://bildergram.distance.workers.dev/api/fitness`,
   Method *POST*, Header `Authorization` = `Bearer <your token>`, Request Body
   *File* = *Combined Text*.
5. **Show Notification** with *Contents of URL* (the hub answers e.g.
   "Gespeichert: 7 Tage · diese Woche 95 min"; remove it once it works).

Run it once by hand to grant Health access. Then add two automations
(Automation → +), each set to **Run Immediately**:

- **App** → *Fitness* → *Is Closed*: runs after you look at a workout, while the
  phone is unlocked (the reliable one);
- **Apple Watch Workout** → *Ends*: catches workouts right away when the phone
  happens to be unlocked.

The admin page shows each phone's last post and what the hub made of it, which
helps while setting this up. The hub also accepts German dates
(`24.11.2026, 00:00 35 min`) and JSON (`{"days":{"2026-11-24":35}}`).

## Development

```bash
npm install
npm run dev              # Worker + admin page locally (workerd), secrets from .dev.vars
npm run renderer:dev     # local stand-in for the Vercel function on :3999
npm run kindle:gallery   # every screen from live data → kindle/dist/gallery/index.html
npm run kindle:build     # Tempelhof pieces + fallbacks + layout.env → kindle/dist
npm run lint             # typecheck the Worker and kindle/lib/*.ts
npx tsc --noEmit -p src/client   # typecheck the admin page
npm run glyphs           # regenerate kindle/lib/glyphs.ts from assets/fonts/Arimo.ttf
```

For local development, `.dev.vars` points the Worker at the local renderer:
`RENDERER_URL=http://localhost:3999`, `RENDERER_TOKEN=local-renderer-token`,
plus an `ADMIN_TOKEN` and `DEVICE_TOKEN_KINDLE_01` of your choice.

To add a screen, compose existing modules in `kindle/lib/screens.mjs` and add
its id to `SCREENS` in `src/routes/kindle.ts`; check it with
`npm run kindle:gallery`.

## Project structure

```
bildergram/
├── src/                       # Cloudflare Worker hub
│   ├── worker.ts              # Routing: /api/kindle/*, /api/fitness, /api/admin/*, admin page
│   ├── routes/kindle.ts       # Check-in, screen images, admin API
│   ├── routes/fitness.ts      # Exercise minutes from the iPhones, goals
│   ├── state.ts               # R2 JSON state, admin token check
│   ├── devices.ts             # Kindle token + MAC authentication
│   ├── types.ts
│   └── client/                # Admin page (vanilla TS, built by Vite)
├── api/screen.mjs             # Vercel function: screen → PNG
├── api/films.mjs              # Vercel function: coming films, marked seen (Letterboxd)
├── kindle/
│   ├── build.mjs              # Tempelhof pieces, fallbacks, layout.env → kindle/dist
│   ├── gallery.mjs            # Design review page from live data
│   ├── install.sh             # Copies kindle/dist to the Kindle over SSH
│   ├── renderer-dev-server.mjs
│   ├── device/dashboard.sh    # The loop that runs on the Kindle
│   ├── scriptlets/            # Library books: Dashboard, test, log
│   ├── data/ausdruecke.json   # Ausdruck des Tages, one per day
│   └── lib/
│       ├── devices.mjs        # The Kindles: panel size and rotation
│       ├── design.mjs         # Design system: tokens, primitives, icons, German formatting
│       ├── screens.mjs        # The screens: frame + boxes → modules
│       ├── modules/           # tempelhof, wetter, kino, ausdruck, fitness
│       ├── render.mjs         # Load a screen's data and render it
│       ├── eink.mjs           # SVG → 16-gray, rotated, 8-bit PNG for eips
│       ├── kino.mjs           # yorck.de fetching and parsing, Letterboxd seen-film filter
│       ├── schedule.mjs       # Tempelhof open/close schedule
│       ├── templehof.ts       # Tempelhof opening hours (ported from openfeld)
│       └── glyphs.ts          # Arimo metrics, used to measure text (generated)
├── assets/fonts/              # Arimo.ttf, Arimo-Bold.ttf (+ OFL license)
├── tools/gen-glyphs.mjs       # Font → kindle/lib/glyphs.ts
├── wrangler.jsonc             # Worker config (R2, RENDERER_URL, assets; no crons)
└── vercel.json                # Vercel config for api/screen.mjs
```

## Implementation phases

- [x] **Phase 1**: Project scaffolding — Vite + Worker + R2 + mock handlers
- [x] **Phase 2**: End-to-end client validation with Kindle #1 (token auth, JSON payload, R2→media flow)
- [x] **Phase 3**: Data aggregation & e-ink image engine — weather, calendar, tasks, pure-JS bitmap renderer
- [x] **Phase 4**: Multi-device expansion + admin dashboard (Kindle #2 profile, health diagnostics)
- [x] **Phase 5**: Metric widget — weather or Tempelhof Field status
- [x] **Phase 6**: Kindle #1 standalone Tempelhof dashboard — prebuilt schedule and images, per-minute RTC wake + `eips` on a Paperwhite 3, Wi-Fi off, power-button exit
- [x] **Phase 7**: Screens on a schedule — Tempelhof by day, IM KINO (Yorck listing rendered on Vercel) in the evening; Worker becomes the hub (check-ins, admin page); the TRMNL render pipeline, weather/calendar/tasks and Kindle #2 were removed
- [x] **Phase 8**: Design system and German screens — `design.mjs` tokens and primitives, Arimo Bold, modules (tempelhof, wetter, kino, ausdruck), four screens (Morgen, Tag, Abend, Nacht), a live-data gallery
- [x] **Phase 9**: Screens on the device — server-rendered screen bases with the Tempelhof box drawn on the Kindle, hourly check-ins while weather shows, battery history and per-screen previews on the admin page, 365 B2 expressions
- [x] **Phase 10**: Two Kindles — screens rendered per device size (Paperwhite 3 at 1448 × 1072, Paperwhite 2 at 1024 × 758), a bundle and paste check per device, per-device config, status and previews on the hub, a device switcher on the admin page
- [x] **Phase 11**: Letterboxd filter — IM KINO leaves out films in the user's public Letterboxd feed (matched by TMDB id via the Yorck film pages) and films hidden by hand on the admin page
- [x] **Phase 12**: Fitness on Nacht — exercise minutes from each iPhone (a Shortcut posting to `/api/fitness`, a token per person), weekly goals on the admin page, Matt and Fiona side by side with progress bars and a Monday–Sunday strip; Nacht checks in hourly
- [x] **Phase 13**: Design round — GESCHLOSSEN underlined, section titles removed, a Präposition des Tages band on Tag (215 verbs with prepositions), the two Kindles never show the same screen at once, and a design-system page (`npm run kindle:design`)
- [x] **Phase 14**: Tile grid — screens as widget tiles on an 8 × 4 grid (`cell()`, tile styles outline / light / fill / dark / bleed); Morgen redesigned: a date tile with Akku, a Feld tile with a half-circle gauge pasted by the Kindle per step, weather with the next days, the Ausdruck as a card with the example's Wörter, Kino tonight (tomorrow's from 22:00) with cinema letters, and Matt + Fiona's exercise rings (today, week, year); Tag, Abend and Nacht rebuilt from the same tiles (one shared Feld piece set); Wörter for all 365 expressions; shared pills, stat rows and a tile type scale on the design-system page
- [x] **Phase 15**: One screen per Kindle — the daily schedule (Morgen, Tag, Abend, Nacht) is gone; each Kindle's config names one screen (both "home" for now), and its tiles change with the time of day themselves (the Feld countdown, tomorrow's films from 22:00); the Kindle checks in on its interval and fetches a new base at midnight
- [ ] **Backlog — Foto screen**: a random photo from a collection uploaded on the admin page (stored in R2, served to the renderer by the hub). Prototyped 2026-11-24: grayscale + contrast, Floyd–Steinberg to the 16 grays with `sharp`; landscape photos full-bleed, portrait photos left with the date right. Open questions: how often it changes (per showing or hourly), with or without the date, which Kindle and when.
- [x] Fiona (`kindle_02`, Paperwhite 2) jailbroken and installed: screens downloaded at 758 × 1024, base and Tempelhof pastes verified pixel-exact on the panel's framebuffer
