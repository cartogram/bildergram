// ============================================================
// Worker Entry Point — Kindle hub (Phase 7)
// The Kindle dashboard checks in here for its schedule and the
// screens (rendered by the Vercel function at RENDERER_URL); the
// iPhones post exercise minutes; the admin SPA edits schedules and
// goals. Everything else is the SPA.
// ============================================================

import { handleFitnessAdmin, handleFitnessPhone } from "./routes/fitness";
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
    if (path === "/api/fitness") {
      return handleFitnessPhone(request, env);
    }
    if (path === "/api/admin/fitness") {
      return handleFitnessAdmin(request, env);
    }
    if (path.startsWith("/api/")) {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    // Admin SPA (static assets, single-page-application fallback).
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
