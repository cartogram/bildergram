// ============================================================
// Vercel function: Kindle screen renderer (Phase 9)
//
//   GET /api/screen?screen=tag&device=kindle_01&date=YYYY-MM-DD&battery=84
//        &cinemas=rollberg,passage,neues-off&from=18:00
//        &letterboxd=<user>&hide=<yorck film slugs>   (IM KINO: leave out seen/hidden films)
//        &fitness=<JSON { people: [{ name, goal, days, syncedAt }] }>   (from the hub)
//     → PNG of the screen's base: everything the server draws (top bar,
//       weather, cinema listing, phrase), Kindle-drawn boxes (Tempelhof)
//       left blank, rotated 8-bit gray for eips, at the device's size
//       (kindle/lib/devices.mjs).
//   &preview=1 → the full screen (Tempelhof included), landscape, for
//                the admin page.
//
// Called by the Cloudflare Worker hub, not by the Kindle. Requires
// `x-renderer-token` to match RENDERER_TOKEN. It runs on Vercel
// because data fetching and rendering need far more than the Workers
// free plan's 10 ms of CPU.
// ============================================================

import { berlinDate, renderScreen } from "../kindle/lib/render.mjs";
import { DEFAULT_DEVICE, DEVICES } from "../kindle/lib/devices.mjs";
import { SCREENS } from "../kindle/lib/screens.mjs";

export async function GET(request) {
  const token = process.env.RENDERER_TOKEN;
  if (token && request.headers.get("x-renderer-token") !== token) {
    return new Response("unauthorized", { status: 401 });
  }

  const q = new URL(request.url).searchParams;
  const screen = q.get("screen") ?? "";
  if (!Object.hasOwn(SCREENS, screen)) return new Response(`unknown screen: ${screen}`, { status: 400 });
  const device = q.get("device") ?? DEFAULT_DEVICE;
  if (!Object.hasOwn(DEVICES, device)) return new Response(`unknown device: ${device}`, { status: 400 });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get("date") ?? "") ? q.get("date") : berlinDate();
  const battery = /^\d{1,3}$/.test(q.get("battery") ?? "") ? Math.min(100, Number(q.get("battery"))) : null;
  const cinemas = (q.get("cinemas") ?? "rollberg,passage,neues-off")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z0-9-]+$/.test(s));
  const from = /^\d{2}:\d{2}$/.test(q.get("from") ?? "") ? q.get("from") : "18:00";
  const letterboxd = /^[A-Za-z0-9_]{1,40}$/.test(q.get("letterboxd") ?? "") ? q.get("letterboxd") : null;
  const hidden = (q.get("hide") ?? "").split(",").filter((s) => /^[a-z0-9-]+$/.test(s));
  let fitness = null;
  try {
    fitness = JSON.parse(q.get("fitness") ?? "null");
  } catch {
    // Validated by the module (parseFitness); a bad parameter just means no data.
  }

  try {
    const png = await renderScreen(screen, { date, battery, cinemas, from, letterboxd, hidden, fitness }, q.get("preview") ? "full" : "base", device);
    return new Response(png, { headers: { "content-type": "image/png", "cache-control": "no-store" } });
  } catch (err) {
    // Shows up in the Vercel function logs (e.g. Open-Meteo or yorck.de being down).
    console.error(`[screen] ${device} ${screen} ${date} failed:`, err);
    return new Response(`render failed: ${err instanceof Error ? err.message : String(err)}`, { status: 502 });
  }
}
