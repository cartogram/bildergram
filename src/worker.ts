// ============================================================
// Worker Entry Point — Kindle hub (Phase 7)
// The Kindle dashboard checks in here for its schedule and the
// Yorck listings (rendered by the Vercel function at KINO_URL);
// the admin SPA edits the schedule. Everything else is the SPA.
// ============================================================

import { handleKindleAdmin, handleKindleDevice } from "./routes/kindle";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (path.startsWith("/api/kindle/")) {
      return handleKindleDevice(request, env);
    }
    if (path === "/api/admin/kindle" || path.startsWith("/api/admin/kindle/")) {
      return handleKindleAdmin(request, env);
    }
    if (path.startsWith("/api/")) {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    // Admin SPA (static assets, single-page-application fallback).
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
