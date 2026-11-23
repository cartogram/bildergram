#!/usr/bin/env node
// ============================================================
// kindle/renderer-dev-server.mjs — serves api/screen.mjs locally on
// :3999 (`npm run renderer:dev`), standing in for the Vercel
// deployment while running the Worker with `npm run dev`.
// Matches .dev.vars: RENDERER_URL=http://localhost:3999 and the same
// RENDERER_TOKEN (default "local-renderer-token").
// ============================================================

import { createServer } from "node:http";
import { GET } from "../api/screen.mjs";

process.env.RENDERER_TOKEN ??= "local-renderer-token";
const PORT = Number(process.env.PORT ?? 3999);

createServer(async (req, res) => {
  const r = await GET(new Request(`http://localhost:${PORT}${req.url}`, { headers: req.headers }));
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log(`screen renderer on http://localhost:${PORT}/api/screen`));
