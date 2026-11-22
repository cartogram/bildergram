# bildergram

**Home Dashboard Server** — a lightweight TRMNL BYOS (Bring-Your-Own-Server) implementation on Cloudflare Workers, purpose-built for e-ink Kindle displays.

Renders high-contrast household dashboards as 1-bit/grayscale PNGs and serves them to jailbroken Kindle devices running [KOReader](https://github.com/koreader/koreader) + `trmnl.koplugin` over HTTPS.

## Architecture

```
External APIs ──→ Cloudflare Worker (Cron) ──→ R2 Storage
                       │                          │
                       │  SVG → PNG pipeline       │
                       │  (resvg-wasm)             │
                       │                          │
Kindle Client ──→ Worker (HTTP) ───────────→ R2 (stream PNG)
(trmnl.koplugin)   GET /api/display
                   GET /media/*
```

## Stack

- **Runtime**: Cloudflare Workers (V8 isolate)
- **Build**: Vite 6 + `@cloudflare/vite-plugin`
- **Storage**: Cloudflare R2
- **Rendering**: SVG → PNG via `@resvg/resvg-wasm` (Phase 3)
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

### Device Profiles

Edit `src/devices.ts` to add or modify Kindle device profiles (MAC address, resolution, orientation, refresh rate, layout template).

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
- [ ] **Phase 2**: End-to-end client validation with Kindle #1
- [ ] **Phase 3**: Data aggregation engine + resvg-wasm rendering + dithering
- [ ] **Phase 4**: Multi-device expansion + admin dashboard polish
