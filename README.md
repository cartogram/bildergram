# bildergram

**Home Dashboard Server** — a lightweight TRMNL BYOS (Bring-Your-Own-Server) implementation on Cloudflare Workers, purpose-built for e-ink Kindle displays.

Renders high-contrast household dashboards as 1-bit/grayscale PNGs and serves them to jailbroken Kindle devices running [KOReader](https://github.com/koreader/koreader) + `trmnl.koplugin` over HTTPS.

**Kindle #1 no longer uses the server.** It runs a standalone, battery-powered
[Tempelhof Field dashboard](#kindle-1--tempelhof-dashboard-on-device-phase-6)
that updates every minute with Wi-Fi off. The Worker stays for future devices
(Kindle #2 is still to be decided).

## Architecture

```
External APIs ──→ Cloudflare Worker (Cron) ──→ R2 Storage
                       │                          │
                       │  Bitmap render pipeline     │
                       │  (pure JS, no WASM)         │
                       │                          │
Kindle Client ──→ Worker (HTTP) ───────────→ R2 (stream PNG)
(trmnl.koplugin)   GET /api/display
                   GET /media/*
```

## Stack

- **Runtime**: Cloudflare Workers (V8 isolate)
- **Build**: Vite 6 + `@cloudflare/vite-plugin`
- **Storage**: Cloudflare R2
- **Rendering**: pure-JS bitmap renderer (bitmap font + shapes) → 1-bit grayscale PNG
- **Scheduling**: Cloudflare Cron Triggers
- **Admin UI**: Vanilla TypeScript SPA bundled via Vite

## Quick Start

```bash
# Install dependencies
npm install

# Generate Cloudflare Worker types
npm run types

# Start local dev server (runs in workerd runtime)
npm run dev

# Build for production
npm run build

# Deploy to Cloudflare
npm run deploy
```

## Configuration

### Cloudflare R2 Bucket

Create the R2 bucket before first deploy:

```bash
npx wrangler r2 bucket create trmnl-display-assets
```

### Device Secrets

Set per-device API tokens as Worker secrets:

```bash
npx wrangler secret put DEVICE_TOKEN_KINDLE_01
npx wrangler secret put DEVICE_TOKEN_KINDLE_02
```

For local development, these are configured in `.dev.vars` (not committed).

For Kindle #1's Apple Calendar feed (Phase 3):

```bash
npx wrangler secret put APPLE_CALENDAR_ICS_URL_01
```

Set this to the calendar's published ICS URL — e.g. Apple's `webcal://` link converted to `https://` (a plain GET returns the calendar as `text/calendar`). The URL can be rotated at any time with another `wrangler secret put` — no code changes needed.

### Device Profiles

Edit `src/devices.ts` to add or modify Kindle device profiles (MAC address, resolution, orientation, refresh rate, layout template).

## Kindle #1 — Tempelhof dashboard (on-device, Phase 6)

Kindle #1 is a **Kindle Paperwhite 3** (7th gen, firmware 5.13.7, jailbroken
with WinterBreak). It shows whether Tempelhofer Feld is open, the closing or
opening time, a countdown that updates every minute, today's date and today's
opening hours.

**How it works.** The status depends only on the opening-hours table and the
clock, so everything is computed ahead of time on your computer and nothing is
fetched at runtime:

- `npm run kindle:build` (`kindle/build.mjs`) writes `kindle/dist/`:
  - the open/close schedule for the next 3 years, from `src/data/templehof.ts`
    and checked against `getTemplehofStatus` at every 7th minute for a year;
  - one full-screen background per state, one countdown image per minute
    value (up to 17h), and one date image per day, all rendered with resvg and
    Arimo in 8-bit, 16-level grayscale and rotated for the portrait
    framebuffer;
  - a browser preview in `kindle/dist/preview/index.html`.
- On the Kindle, `kindle/device/tempelhof.sh` runs one loop per minute: wake on
  the RTC alarm, look up the next event, paste the countdown with `eips`
  (a full redraw every 15 minutes and on state changes clears ghosting), then
  suspend to RAM until the next minute. Wi-Fi is switched off while it runs.

**Install** (KOReader → gear → Network → tick **SSH server**; it listens on
port 2222 and accepts the keys in `koreader/settings/SSH/authorized_keys`):

```bash
npm run kindle:build
KINDLE_HOST=192.168.0.93 npm run kindle:install   # the IP KOReader shows
```

**Use.** Three books appear in the Kindle library:

| Book | What it does |
|---|---|
| **Tempelhof** | Starts the dashboard. |
| **Tempelhof (30-min test)** | Same, but returns to the Kindle UI by itself after 30 minutes. |
| **Tempelhof log** | Shows the end of `/mnt/us/tempelhof/tempelhof.log` on screen. Times are UTC. |

To exit, short-press the power button (plugging in USB also exits). The Kindle
interface then reloads, which looks like a restart but isn't one. The log
records each start, the battery level every hour, and why the dashboard
exited.

**Rebuild before the schedule runs out** (3 years from the build date), or
after changing the opening hours in `src/data/templehof.ts`. If the image
shows upside down, build with `KINDLE_ROTATE=cw`.

### TRMNL client (Worker-rendered devices)

Devices served by the Worker use [trmnl-koreader](https://github.com/usetrmnl/trmnl-koreader):
put the device token (`DEVICE_TOKEN_KINDLE_0x`) in `koreader/plugins/trmnl.koplugin/apikey.txt`
and set **Tools → TRMNL Display → Configure TRMNL → Base URL** to the Worker
URL. The plugin keeps the Kindle awake to refresh, so it suits plugged-in
displays.

Known issue: the plugin only re-downloads when the `filename` in the
`/api/display` response changes, and the Worker always returns
`kindle_0x_latest.png`, so a running plugin keeps showing its first image.
Fix this (e.g. put the render timestamp in the filename) before using the
Worker for a device again.

## Metrics (Phase 5)

Devices can show a **metric widget** — a single label + value + unit.
Two sources exist:

- `source: "weather"` (the default) — the value comes from
  `data.weather.temp` (e.g. Outdoor Temperature). See
  `metricValue`/`metricRows` in `src/pipeline/draw.ts`.
- `source: "templehof"` — Kindle #1 shows the **Tempelhof Field** status
  (open/closed + countdown to the next event), ported from
  [openfeld](https://isthefeldopen.com) (`src/data/templehof.ts`): while the
  field is open — "Open — closes 22:00" and "2h 15m to close" — or closed —
  "Closed — opens 06:00" and "5h 12m until open".

Configure it per device via `DeviceConfig.metric` —
`{ label: string, unit?: string, source?: "weather" | "templehof" }`:

```ts
{
  // ... other fields ...
  metric: { label: "Tempelhof Field", source: "templehof" },
}
```

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `GET /api/display` | GET | TRMNL display API — returns JSON with image URL |
| `GET /media/*` | GET | Streams PNG images from R2 |
| `GET /api/admin/devices` | GET | Lists all devices with render status |
| `POST /api/admin/render` | POST | Triggers re-render for all devices |
| `POST /api/admin/render/:id` | POST | Triggers re-render for a single device |
| `GET /` | GET | Admin SPA dashboard |

## Project Structure

```
bildergram/
├── wrangler.jsonc         # Cloudflare Worker config (R2, crons, assets)
├── vite.config.ts         # Vite + @cloudflare/vite-plugin
├── index.html             # Admin SPA entry
├── assets/fonts/          # Arimo.ttf (+ OFL license) — source for the bitmap font
├── tools/
│   └── gen-glyphs.mjs     # Font → src/pipeline/glyphs.ts (`npm run glyphs`)
├── kindle/                # Kindle #1 on-device Tempelhof dashboard (Phase 6)
│   ├── build.mjs          # Schedule + images → kindle/dist (`npm run kindle:build`)
│   ├── install.sh         # Copies kindle/dist to the Kindle over SSH (`npm run kindle:install`)
│   ├── device/tempelhof.sh  # The loop that runs on the Kindle
│   └── scriptlets/        # Library "books" that start it / show the log
├── src/
│   ├── worker.ts          # Worker entry — routing & cron handler
│   ├── types.ts           # Shared TypeScript types
│   ├── devices.ts         # Device registry & authentication
│   ├── routes/
│   │   ├── display.ts     # GET /api/display (TRMNL API)
│   │   ├── media.ts       # GET /media/* (R2 streaming)
│   │   └── admin-api.ts   # /api/admin/* endpoints
│   ├── data/
│   │   ├── aggregate.ts   # Per-device source fetch + cached fallback
│   │   ├── cached.ts      # Reads last-known data from R2 metadata
│   │   ├── weather.ts     # OpenWeatherMap current + forecast
│   │   ├── calendar.ts    # Google Calendar API / ICS feeds
│   │   ├── tasks.ts       # Todoist
│   │   └── templehof.ts   # Tempelhof Field open/closed status
│   ├── pipeline/
│   │   ├── scheduler.ts   # Cron orchestrator — renders + writes to R2
│   │   ├── renderer.ts    # Bitmap → PNG rendering entry point
│   │   ├── draw.ts        # Dashboard layout & widgets
│   │   ├── bitmap.ts      # 1-bit canvas, text & shape drawing
│   │   ├── glyphs.ts      # Generated bitmap font (do not edit)
│   │   └── eink.ts        # 1-bit grayscale PNG encoder
│   └── client/
│       ├── main.ts        # Admin SPA app
│       └── styles.css     # Admin UI styles
└── .dev.vars              # Local dev secrets (not committed)
```

## Bitmap Font

The Worker never rasterises a font itself: text is drawn from a bitmap
glyph table, `src/pipeline/glyphs.ts`. The table is generated from
`assets/fonts/Arimo.ttf` (Google Fonts' `Arimo[wght].ttf`, SIL Open Font
License — see `assets/fonts/OFL.txt`) at 26px, which gives an 18px cap height.
`drawText` scales it by whole numbers only, so sizes 14–26 render at 1× and
36 renders at 2×.

Regenerate the table after changing the font or the character set:

```bash
npm run glyphs   # node tools/gen-glyphs.mjs [fontPath] [fontFamily]
```

The table covers printable ASCII, Latin-1 letters (ä ö ü ß é …) and
`° × € – — ‘ ’ “ ” • · …`. Each glyph stores its ink bitmap plus its
offset and advance width, so all text sits on a shared baseline.
Accented letters outside the table fall back to their base letter
(č → c). Any other missing character renders as a blank space. To support
more characters, add them to `CHARS` in `tools/gen-glyphs.mjs` and
regenerate.

## Implementation Phases

- [x] **Phase 1**: Project scaffolding — Vite + Worker + R2 + mock handlers
- [x] **Phase 2**: End-to-end client validation with Kindle #1 (token auth, JSON payload, R2→media flow validated on workerd dev server)
- [x] **Phase 3**: Data aggregation & E-Ink image engine — OpenWeatherMap weather + forecast, Google Calendar/iCal events, Todoist tasks, data-driven dashboard layout, pure-JS bitmap renderer (Arimo-based bitmap font), 1-bit grayscale PNG output, graceful degradation to cached data
- [x] **Phase 4**: Multi-device expansion + admin dashboard polish (Kindle #2 profile; SPA served at /admin; side-by-side device previews; health diagnostics: renderCount, lastOutcome, lastError + auto-refresh; manual render triggers)
- [x] **Phase 5**: Metric widget — a single label + value, sourced from the weather or the Tempelhof Field status
- [x] **Phase 6**: Kindle #1 standalone Tempelhof dashboard — schedule and images built ahead of time, per-minute RTC wake + `eips` on a Paperwhite 3, Wi-Fi off, power-button exit (verified on the device; battery life still being measured)
