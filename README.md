# bildergram

A battery-powered e-ink dashboard on a jailbroken **Kindle Paperwhite 3**, in
German. It shows a few hand-designed screens on a daily schedule:

| Default time | Screen | What it shows |
|---|---|---|
| 06:00 | **Morgen** | Weather (now, 3-day high/low and precipitation, wind, sunset) and the *Ausdruck des Tages* |
| 09:00 | **Tag** | Tempelhofer Feld (open/closed, countdown updated every minute) and the weather |
| 18:15 | **Abend** | IM KINO: the evening's screenings at your chosen [Yorck](https://www.yorck.de) cinemas |
| 23:00 | **Nacht** | The *Ausdruck des Tages* (B2: expression, English meaning, example sentence) |

The Kindle sleeps between updates with Wi-Fi off. It goes online on an
interval (default hourly) while a weather screen is showing, when it doesn't
have the current screen yet, and when you press its power button.

## How it works

```
┌──────────── Kindle Paperwhite 3 (kindle/device/dashboard.sh) ─────────────┐
│  draw the screen's base image; on Tag also paste the Tempelhof panel and   │
│  a countdown every minute (prebuilt) → suspend until the next wake (RTC)   │
└───────┬────────────────────────────────────────────────────────────────────┘
        │ check-in: battery + log up; schedule down; then one base image per screen
        ▼
Cloudflare Worker hub (src/) ── schedule, status + battery history, admin page, R2 state
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
- **The Worker is the hub.** It stores the config and the last check-in
  (with a week of battery readings) in R2 and serves the admin page. The
  Kindle only ever talks to the Worker.

### On the Kindle

| When | What happens |
|---|---|
| A slot starts | Draw that screen (the downloaded base, or a "Keine Verbindung" fallback) |
| Tag | The Tempelhof countdown changes every minute; a full redraw every 15 minutes clears ghosting |
| Every 60 min (configurable) while Morgen/Tag shows | Check in: fresh weather, schedule changes |
| Current screen not downloaded for its day | Check in (retries every 15 min if offline) |
| Power button | Check in now ("Aktualisiere …" in the top bar) |
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
npx wrangler secret put DEVICE_TOKEN_KINDLE_01  # the Kindle's token (goes into hub.env)
npm run deploy
```

`RENDERER_URL` (the Vercel URL) is a plain var in `wrangler.jsonc`. The R2
bucket `trmnl-display-assets` holds the hub state (`kindle/kindle_01/config.json`,
`status.json`).

### 3. Kindle

Requires a jailbroken Kindle (WinterBreak2; firmware 5.13.7 here) and
KOReader, whose SSH server is used for installing: KOReader → gear →
Network → tick **SSH server** (port 2222; put your public key in
`koreader/settings/SSH/authorized_keys`).

```bash
npm run kindle:build
KINDLE_HOST=192.168.0.93 \
KINDLE_HUB_URL=https://bildergram.distance.workers.dev \
KINDLE_HUB_TOKEN=<DEVICE_TOKEN_KINDLE_01> \
npm run kindle:install
```

The hub settings are written to `/mnt/us/dashboard/hub.env` and kept across
later installs, so `KINDLE_HOST=… npm run kindle:install` is enough after the
first time. Rebuild and reinstall before the Tempelhof schedule runs out
(3 years after the build), or after changing the hours in
`kindle/lib/templehof.ts`. If the screen shows upside down, build with
`KINDLE_ROTATE=cw`.

## Admin page

The Worker URL (https://bildergram.distance.workers.dev) serves the admin page
(in English). It asks once for `ADMIN_TOKEN` and then shows:

- the last check-in (time, battery, screen, version, recent log) and a
  battery chart for the last week;
- the schedule (which screen from which time) and the check-in interval;
- the cinemas for IM KINO and the first screening time to list;
- a one-shot **Return to the normal Kindle UI** switch;
- a live preview of each screen.

Changes reach the Kindle at its next check-in; press its power button to apply
them right away.

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
│   ├── worker.ts              # Routing: /api/kindle/*, /api/admin/kindle*, admin page
│   ├── routes/kindle.ts       # Check-in, screen images, admin API, R2 state
│   ├── devices.ts             # Kindle token + MAC authentication
│   ├── types.ts
│   └── client/                # Admin page (vanilla TS, built by Vite)
├── api/screen.mjs             # Vercel function: screen → PNG
├── kindle/
│   ├── build.mjs              # Tempelhof pieces, fallbacks, layout.env → kindle/dist
│   ├── gallery.mjs            # Design review page from live data
│   ├── install.sh             # Copies kindle/dist to the Kindle over SSH
│   ├── renderer-dev-server.mjs
│   ├── device/dashboard.sh    # The loop that runs on the Kindle
│   ├── scriptlets/            # Library books: Dashboard, test, log
│   ├── data/ausdruecke.json   # Ausdruck des Tages, one per day
│   └── lib/
│       ├── design.mjs         # Design system: tokens, primitives, icons, German formatting
│       ├── screens.mjs        # The screens: frame + boxes → modules
│       ├── modules/           # tempelhof, wetter, kino, ausdruck
│       ├── render.mjs         # Load a screen's data and render it
│       ├── eink.mjs           # SVG → 16-gray, rotated, 8-bit PNG for eips
│       ├── kino.mjs           # yorck.de fetching and parsing
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
- [ ] **Next**: Kindle #2 (a Paperwhite 2: 1024 × 758 landscape at 212 ppi, same aspect ratio) on the same hub, with screens rendered per device size; hide films already seen on Letterboxd from IM KINO
