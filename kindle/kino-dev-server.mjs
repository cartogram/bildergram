#!/usr/bin/env node
// ============================================================
// kindle/kino-dev-server.mjs — serves api/kino.mjs locally on
// :3999 (`npm run kino:dev`), standing in for the Vercel
// deployment while running the Worker with `npm run dev`.
// Matches .dev.vars: KINO_URL=http://localhost:3999 and the same
// KINO_TOKEN (default "local-kino-token").
// ============================================================

import { createServer } from "node:http";
import { GET } from "../api/kino.mjs";

process.env.KINO_TOKEN ??= "local-kino-token";
const PORT = Number(process.env.PORT ?? 3999);

createServer(async (req, res) => {
  const r = await GET(new Request(`http://localhost:${PORT}${req.url}`, { headers: req.headers }));
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log(`kino renderer on http://localhost:${PORT}/api/kino`));
