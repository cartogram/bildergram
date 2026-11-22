// ============================================================
// Worker Entry Point
// Routes incoming requests to the appropriate handler and
// processes scheduled cron triggers for background rendering.
// ============================================================

import { handleDisplayRequest } from "./routes/display";
import { handleMediaRequest } from "./routes/media";
import { handleAdminApi } from "./routes/admin-api";
import { handleCronTrigger } from "./pipeline/scheduler";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- API Routes (run Worker first, before static assets) ---

    // TRMNL Display API
    if (path === "/api/display" && request.method === "GET") {
      return handleDisplayRequest(request, env);
    }

    // Media streaming from R2
    if (path.startsWith("/media/")) {
      return handleMediaRequest(request, env);
    }

    // Admin API endpoints
    if (path.startsWith("/api/admin/")) {
      return handleAdminApi(request, env, ctx);
    }

    // --- Static Assets / SPA fallback ---
    // The @cloudflare/vite-plugin + assets binding handles this.
    // Any unmatched route falls through to the SPA via the
    // "not_found_handling": "single-page-application" config.
    return env.ASSETS.fetch(request);
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(handleCronTrigger(controller, env));
  },
} satisfies ExportedHandler<Env>;
