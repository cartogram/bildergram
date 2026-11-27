// ============================================================
// Worker Entry Point — Kindle hub (Phase 7)
// The Kindle dashboard checks in here for its screen and the
// screens (rendered by the Vercel function at RENDERER_URL); the
// iPhones post exercise minutes; the admin SPA edits each Kindle's
// screen and the goals, and shows the Design. Everything else is the SPA.
// ============================================================

import { handleDesignAdmin } from "./routes/design";
import { handleFitnessAdmin, handleFitnessPhone } from "./routes/fitness";
import { handleKindleAdmin, handleKindleDevice } from "./routes/kindle";
import { handlePhotoForRenderer, handlePhotosAdmin } from "./routes/photos";

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
    if (path === "/api/admin/photos" || path.startsWith("/api/admin/photos/")) {
      return handlePhotosAdmin(request, env);
    }
    if (path.startsWith("/api/photos/")) {
      return handlePhotoForRenderer(request, env);
    }
    if (path === "/api/admin/design" || path.startsWith("/api/admin/design/")) {
      return handleDesignAdmin(request, env);
    }
    if (path.startsWith("/api/")) {
      return Response.json({ error: "not found" }, { status: 404 });
    }

    // Admin SPA (static assets, single-page-application fallback).
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
