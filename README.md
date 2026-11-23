# bildergram

A battery-powered e-ink dashboard on a jailbroken **Kindle Paperwhite 3**:

- **Daytime: Tempelhofer Feld.** Open or closed, the closing or opening time, a
  countdown that updates every minute, today's date and today's opening hours.
- **Evening: IM KINO.** That evening's screenings at your chosen
  [Yorck](https://www.yorck.de) cinemas (default: Rollberg, Passage,
  Neues Off), with formats such as OmU / OV.

The Kindle sleeps between updates with Wi-Fi off. It only goes online to fetch
new cinema listings (every few days) or when you press its power button.

## How it works

```
┌──────────── Kindle Paperwhite 3 (kindle/device/dashboard.sh) ───────────┐
│  every minute: wake on RTC alarm → paste countdown with eips → suspend   │
│  evening:      show the downloaded listing → sleep until 06:00          │
└───────┬──────────────────────────────────────────────────────────────────┘
        │ check-in (06:00 when a listing is missing, or power button)
        ▼
Cloudflare Worker hub (src/)  ── schedule, status, admin page, R2 state
        │ GET /api/kino
        ▼
Vercel function (api/kino.mjs) ── fetches yorck.de cinema pages, renders PNG
```

- **Tempelhof is precomputed.** Its status depends only on the opening-hours
  table and the clock, so `npm run kindle:build` writes the open/close
  schedule for the next 3 years plus every image the screen needs (one
  background per state, one countdown image per minute value, one date image
  per day). The Kindle never downloads anything for it.
- **The cinema listing is rendered on Vercel.** yorck.de publishes a few days
  ahead. Rendering needs more CPU than the Workers free plan allows (10 ms),
  so the Worker only passes the image through.
- **The Worker is the hub.** It stores the schedule and the last check-in in
  R2 and serves the admin page. The Kindle only ever talks to the Worker.

### On the Kindle

| When | What happens |
|---|---|
| 06:00–18:15 (default) | Tempelhof screen, updated every minute; a full redraw every 15 minutes clears ghosting |
| 18:15–06:00 (default) | IM KINO for that evening; the Kindle sleeps until the next switch |
| First wake after 06:00 | If the listing for today or tomorrow is missing, check in over Wi-Fi |
| Power button | Check in now ("Updating…" in the corner): picks up schedule changes and fresh listings |
| USB plugged in (or "Return to Kindle UI" on the admin page) | Exit to the normal Kindle UI, which reloads (it looks like a restart but isn't one) |

Three books in the Kindle library control it:

| Book | What it does |
|---|---|
| **Dashboard** | Starts the dashboard. |
| **Dashboard (30-min test)** | Same, but returns to the Kindle UI by itself after 30 minutes. |
| **Dashboard log** | Shows the end of `/mnt/us/dashboard/dashboard.log` on screen (times in UTC). |

## Setup

### 1. Vercel renderer

The function lives in `api/kino.mjs` and reuses `kindle/lib/`; `vercel.json`
skips the Vite build and bundles the font and WASM. The project is
`bildergram-kino` on the `matt-seccafiens-projects` team (linked to this
GitHub repo, so pushes deploy).

```bash
vercel env add KINO_TOKEN production   # shared secret, also set on the Worker
vercel deploy --prod
```

### 2. Cloudflare Worker hub

```bash
npx wrangler secret put ADMIN_TOKEN             # for the admin page
npx wrangler secret put KINO_TOKEN              # same value as on Vercel
npx wrangler secret put DEVICE_TOKEN_KINDLE_01  # the Kindle's token (goes into hub.env)
npm run deploy
```

`KINO_URL` (the Vercel URL) is a plain var in `wrangler.jsonc`. The R2 bucket
`trmnl-display-assets` holds the hub state (`kindle/kindle_01/config.json`,
`status.json`).

### 3. Kindle

Requires a jailbroken Kindle (WinterBreak; firmware 5.13.7 here) and
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

The Worker URL (https://bildergram.distance.workers.dev) serves the admin page.
It asks once for `ADMIN_TOKEN` and then shows:

- the last check-in: time, battery, screen, listings on the device, recent log;
- the schedule (which screen from which time) and the cinemas;
- a one-shot **Return to the normal Kindle UI** switch;
- a preview of the next published listing.

Changes reach the Kindle at its next check-in; press its power button to apply
them right away.

## Development

```bash
npm install
npm run dev            # Worker + admin page locally (workerd), secrets from .dev.vars
npm run kino:dev       # local stand-in for the Vercel function on :3999
npm run kino:preview   # render tonight's listing to kindle/dist/preview/
npm run kindle:build   # Tempelhof schedule + images + kindle/dist/preview/index.html
npm run lint           # typecheck the Worker and kindle/lib/*.ts
npx tsc --noEmit -p src/client   # typecheck the admin page
npm run glyphs         # regenerate kindle/lib/glyphs.ts from assets/fonts/Arimo.ttf
```

For local development, `.dev.vars` points the Worker at the local renderer:
`KINO_URL=http://localhost:3999`, `KINO_TOKEN=local-kino-token`, plus an
`ADMIN_TOKEN` and `DEVICE_TOKEN_KINDLE_01` of your choice.

## Project structure

```
bildergram/
├── src/                     # Cloudflare Worker hub
│   ├── worker.ts            # Routing: /api/kindle/*, /api/admin/kindle*, admin page
│   ├── routes/kindle.ts     # Check-in, listing images, admin API, R2 state
│   ├── devices.ts           # Kindle token + MAC authentication
│   ├── types.ts
│   └── client/              # Admin page (vanilla TS, built by Vite)
├── api/kino.mjs             # Vercel function: Yorck listing → PNG
├── kindle/
│   ├── build.mjs            # Tempelhof schedule + images → kindle/dist
│   ├── install.sh           # Copies kindle/dist to the Kindle over SSH
│   ├── device/dashboard.sh  # The loop that runs on the Kindle
│   ├── scriptlets/          # Library books: Dashboard, test, log
│   ├── lib/
│   │   ├── eink.mjs         # SVG → 16-gray, rotated, 8-bit PNG for eips
│   │   ├── kino.mjs         # yorck.de parsing + IM KINO layout
│   │   ├── templehof.ts     # Tempelhof opening hours (ported from openfeld)
│   │   └── glyphs.ts        # Arimo metrics, used to measure text (generated)
│   ├── kino-preview.mjs
│   └── kino-dev-server.mjs
├── assets/fonts/            # Arimo.ttf (+ OFL license)
├── tools/gen-glyphs.mjs     # Font → kindle/lib/glyphs.ts
├── wrangler.jsonc           # Worker config (R2, KINO_URL, assets; no crons)
└── vercel.json              # Vercel config for api/kino.mjs
```

## Implementation phases

- [x] **Phase 1**: Project scaffolding — Vite + Worker + R2 + mock handlers
- [x] **Phase 2**: End-to-end client validation with Kindle #1 (token auth, JSON payload, R2→media flow)
- [x] **Phase 3**: Data aggregation & e-ink image engine — weather, calendar, tasks, pure-JS bitmap renderer
- [x] **Phase 4**: Multi-device expansion + admin dashboard (Kindle #2 profile, health diagnostics)
- [x] **Phase 5**: Metric widget — weather or Tempelhof Field status
- [x] **Phase 6**: Kindle #1 standalone Tempelhof dashboard — prebuilt schedule and images, per-minute RTC wake + `eips` on a Paperwhite 3, Wi-Fi off, power-button exit
- [x] **Phase 7**: Screens on a schedule — Tempelhof by day, IM KINO (Yorck listing rendered on Vercel) in the evening; Worker becomes the hub (check-ins, admin page); the TRMNL render pipeline, weather/calendar/tasks and Kindle #2 were removed
