#!/usr/bin/env node
// ============================================================
// kindle/renderer-dev-server.mjs — serves api/screen.mjs,
// api/films.mjs and api/design.mjs locally on
// :3999 (`npm run renderer:dev`), standing in for the Vercel
// deployment while running the Worker with `npm run dev`.
// Matches .dev.vars: RENDERER_URL=http://localhost:3999 and the same
// RENDERER_TOKEN (default "local-renderer-token").
// ============================================================

import { createServer } from "node:http";
import { GET as design } from "../api/design.mjs";
import { GET as films } from "../api/films.mjs";
import { GET as screen } from "../api/screen.mjs";

process.env.RENDERER_TOKEN ??= "local-renderer-token";
const PORT = Number(process.env.PORT ?? 3999);

createServer(async (req, res) => {
  const handler = req.url.startsWith("/api/films") ? films : req.url.startsWith("/api/design") ? design : screen;
  const r = await handler(new Request(`http://localhost:${PORT}${req.url}`, { headers: req.headers }));
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log(`renderer on http://localhost:${PORT}/api/screen, /api/films and /api/design`));
