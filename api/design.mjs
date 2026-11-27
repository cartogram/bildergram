// ============================================================
// Vercel function: the Design page's content (Phase 16)
//
//   GET /api/design            → JSON { rendered, tokens, specimens: [{ group, title, sub, h }] }
//   GET /api/design?specimen=3 → PNG of that specimen (1448 px wide, the panel's 16 grays)
//
// For the admin page's Design tab, through the hub
// (/api/admin/design). The tokens and specimens come from
// kindle/lib/specimens.mjs, like the local page (npm run kindle:design).
// Requires `x-renderer-token` to match RENDERER_TOKEN.
// ============================================================

import { encodePng, initRenderer, rasterize } from "../kindle/lib/eink.mjs";
import { designData, designSpecimens, designTokens } from "../kindle/lib/specimens.mjs";

/** The specimens' data (live weather) is reused for 10 minutes, so a page of images fetches it once. */
const TTL = 10 * 60_000;
let cache = null;

async function specimens() {
  if (!cache || Date.now() - cache.at > TTL) {
    const data = await designData();
    cache = { at: Date.now(), date: data.date, list: designSpecimens(data) };
  }
  return cache;
}

export async function GET(request) {
  const token = process.env.RENDERER_TOKEN;
  if (token && request.headers.get("x-renderer-token") !== token) {
    return new Response("unauthorized", { status: 401 });
  }
  const q = new URL(request.url).searchParams;
  try {
    const { date, list } = await specimens();
    if (!q.has("specimen")) {
      return Response.json(
        { rendered: date, tokens: designTokens(), specimens: list.map(({ group, title, sub, h }) => ({ group, title, sub, h })) },
        { headers: { "cache-control": "no-store" } },
      );
    }
    const i = Number(q.get("specimen"));
    if (!Number.isInteger(i) || i < 0 || i >= list.length) return new Response("unknown specimen", { status: 404 });
    await initRenderer();
    return new Response(encodePng(rasterize(list[i].svg)), { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  } catch (err) {
    console.error("[design] failed:", err);
    return new Response(`design failed: ${err instanceof Error ? err.message : String(err)}`, { status: 502 });
  }
}
