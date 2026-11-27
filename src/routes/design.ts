// ============================================================
// Design (Phase 16) — the admin page's Design tab: the tile design's
// tokens and rendered specimens, from the Vercel renderer
// (api/design.mjs, kindle/lib/specimens.mjs). The Worker only passes
// bytes through.
//
// Admin endpoints (Authorization: Bearer ADMIN_TOKEN):
//   GET /api/admin/design          { rendered, tokens, specimens: [{ group, title, sub, h }] }
//   GET /api/admin/design/<n>.png  specimen n (PNG)
// ============================================================

import { adminAuthorized } from "../state";
import type { AppEnv } from "../types";

export async function handleDesignAdmin(request: Request, env: AppEnv): Promise<Response> {
  const denied = adminAuthorized(request, env);
  if (denied) return denied;
  if (request.method !== "GET") return Response.json({ error: "method not allowed" }, { status: 405 });
  if (!env.RENDERER_URL) return new Response("RENDERER_URL is not configured", { status: 503 });

  const path = new URL(request.url).pathname;
  const url = new URL("/api/design", env.RENDERER_URL);
  const m = path.match(/^\/api\/admin\/design\/(\d{1,3})\.png$/);
  if (m) url.searchParams.set("specimen", m[1]);
  else if (path !== "/api/admin/design") return Response.json({ error: "not found" }, { status: 404 });

  const res = await fetch(url, { headers: env.RENDERER_TOKEN ? { "x-renderer-token": env.RENDERER_TOKEN } : {} });
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream", "cache-control": "no-store" },
  });
}
