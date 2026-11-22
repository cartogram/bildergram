# bildergram

**Home Dashboard Server** — a lightweight TRMNL BYOS (Bring-Your-Own-Server) implementation on Cloudflare Workers, purpose-built for e-ink Kindle displays.

Renders high-contrast household dashboards as 1-bit/grayscale PNGs and serves them to jailbroken Kindle devices running [KOReader](https://github.com/koreader/koreader) + `trmnl.koplugin` over HTTPS.

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

## Kindle #1 — Client Setup (KOReader + trmnl.koplugin)

Per the PRD, Kindle #1 is the first validation target (Kitchen Display —
landscape, 1024 × 758 px, 15-min refresh).

**Prerequisites**

- Kindle is jailbroken and runs a modern build of KOReader.
- The `trmnl.koplugin` client plugin is available — copy it to the Kindle:
  ```
  cp -R trmnl.koplugin <kindle-mount>/koreader/plugins/
  ```
  (or transfer over USB into `/koreader/plugins/`)

**API Key Setup**

Save the assigned device token on the Kindle:

```
/koreader/plugins/trmnl.koplugin/apikey.txt
```

For production, this token is the `DEVICE_TOKEN_KINDLE_01` Cloudflare Worker
secret (set with `npx wrangler secret put DEVICE_TOKEN_KINDLE_01`).

**Base URL Configuration**

In KOReader: **Tools → TRMNL Display → Configure TRMNL → Server Base URL** —
set it to the production Cloudflare Workers URL, e.g.
`https://bildergram.your-subdomain.workers.dev` (no trailing slash).

**Power & Display Tuning**

- Desk/Wall Power Mode: enable **Tools → More tools → Keep alive** so the
  Kindle stays connected for rendering.
- Battery Saver Mode: keep native suspend enabled; configure
  `trmnl.koplugin` wake intervals to match the device's `refreshRate`
  (Kindle #1: 900 s).

**Expected first run:** the render pipeline runs every 15 minutes (06:00–23:00
UTC) and writes the PNG to R2; Kindle #1 wakes on its 900 s refresh, GETs
`/api/display`, and downloads the PNG from `/media/kindle_01_latest.png`.
Until Phase 3, the rendered image is a valid white placeholder at the full
device resolution.

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
├── src/
│   ├── worker.ts          # Worker entry — routing & cron handler
│   ├── types.ts           # Shared TypeScript types
│   ├── devices.ts         # Device registry & authentication
│   ├── routes/
│   │   ├── display.ts     # GET /api/display (TRMNL API)
│   │   ├── media.ts       # GET /media/* (R2 streaming)
│   │   └── admin-api.ts   # /api/admin/* endpoints
│   ├── pipeline/
│   │   ├── scheduler.ts   # Cron orchestrator
│   │   └── renderer.ts    # SVG → PNG rendering engine
│   └── client/
│       ├── main.ts        # Admin SPA app
│       └── styles.css     # Admin UI styles
└── .dev.vars              # Local dev secrets (not committed)
```

## Implementation Phases

- [x] **Phase 1**: Project scaffolding — Vite + Worker + R2 + mock handlers
- [x] **Phase 2**: End-to-end client validation with Kindle #1 (token auth, JSON payload, R2→media flow validated on workerd dev server)
- [x] **Phase 3**: Data aggregation & E-Ink image engine — OpenWeatherMap weather + forecast, Google Calendar/iCal events, Todoist tasks, data-driven dashboard layout, pure-JS bitmap renderer (Arimo-based bitmap font), 1-bit grayscale PNG output, graceful degradation to cached data
- [x] **Phase 4**: Multi-device expansion + admin dashboard polish (Kindle #2 profile; SPA served at /admin; side-by-side device previews; health diagnostics: renderCount, lastOutcome, lastError + auto-refresh; manual render triggers)
