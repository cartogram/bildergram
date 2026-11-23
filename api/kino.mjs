// ============================================================
// Vercel function: Yorck cinema listing for the Kindle (Phase 7)
//
//   GET /api/kino                    → { days, fetchedAt, cinemas }  published days
//   GET /api/kino?date=YYYY-MM-DD    → PNG, rotated 8-bit gray for eips
//        &preview=1                  → unrotated landscape PNG (admin page)
//        &from=18:00                 → first screening time to list
//        &cinemas=rollberg,passage   → yorck.de cinema slugs
//
// Called by the Cloudflare Worker hub, not by the Kindle directly.
// Requires the `x-kino-token` header to match KINO_TOKEN when set.
// Runs here rather than in the Worker because parsing and rendering
// need far more than the Workers free plan's 10 ms of CPU.
// ============================================================

import { encodePng, initRenderer, rasterize, rotate } from "../kindle/lib/eink.mjs";
import { DEFAULT_CINEMAS, fetchProgramme, listingSvg, publishedDays } from "../kindle/lib/kino.mjs";

export async function GET(request) {
  const token = process.env.KINO_TOKEN;
  if (token && request.headers.get("x-kino-token") !== token) {
    return new Response("unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const slugs = (url.searchParams.get("cinemas") ?? DEFAULT_CINEMAS.join(","))
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9-]+$/.test(s));
  if (!slugs.length) return new Response("no valid cinemas", { status: 400 });

  let programme;
  try {
    programme = await fetchProgramme(slugs);
  } catch (err) {
    return new Response(`yorck.de fetch failed: ${err.message}`, { status: 502 });
  }

  const date = url.searchParams.get("date");
  if (!date) {
    return Response.json(
      { days: publishedDays(programme), fetchedAt: programme.fetchedAt, cinemas: programme.cinemas.map((c) => c.name) },
      { headers: { "cache-control": "s-maxage=1800" } },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Response("bad date", { status: 400 });
  const from = /^\d{2}:\d{2}$/.test(url.searchParams.get("from") ?? "") ? url.searchParams.get("from") : "18:00";

  await initRenderer();
  const updated = new Date(programme.fetchedAt).toLocaleString("en-GB", {
    timeZone: "Europe/Berlin", weekday: "short", hour: "2-digit", minute: "2-digit",
  });
  const img = rasterize(listingSvg(programme, date, { from, updated }));
  const out = url.searchParams.get("preview") ? img : rotate(img);
  return new Response(encodePng(out), {
    headers: { "content-type": "image/png", "cache-control": "s-maxage=1800" },
  });
}
