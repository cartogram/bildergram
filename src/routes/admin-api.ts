// ============================================================
// /api/admin/* — Administrative API endpoints
// Provides device status, render metadata, and manual triggers
// for the admin SPA frontend.
// ============================================================

import type { RenderMetadata } from "../types";
import { DEVICES } from "../devices";
import { renderAllDevices } from "../pipeline/scheduler";

export async function handleAdminApi(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS headers for the SPA frontend
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // GET /api/admin/devices — list all devices with render status
  if (path === "/api/admin/devices" && request.method === "GET") {
    const deviceStatuses = await Promise.all(
      DEVICES.map(async (device) => {
        const r2Head = await env.DISPLAY_ASSETS.head(device.r2Key);
        const meta = r2Head?.customMetadata as Record<string, string> | undefined;

        return {
          ...device,
          // Strip the secret key name from the response
          tokenEnvKey: undefined,
          hasImage: !!r2Head,
          lastRenderedAt: meta?.renderedAt ? parseInt(meta.renderedAt, 10) : null,
          fileSize: r2Head?.size ?? null,
          hadErrors: meta?.hadErrors === "true",
          // Phase 4 health diagnostics
          renderCount: meta?.renderCount ? parseInt(meta.renderCount, 10) : null,
          lastOutcome: meta?.lastOutcome ?? null,
          lastError: meta?.lastError || null,
        };
      }),
    );

    return Response.json(
      { devices: deviceStatuses },
      { headers: corsHeaders },
    );
  }

  // POST /api/admin/render — trigger a manual render for all devices
  if (path === "/api/admin/render" && request.method === "POST") {
    ctx.waitUntil(renderAllDevices(env));
    return Response.json(
      { status: "ok", message: "Render pipeline triggered for all devices" },
      { headers: corsHeaders },
    );
  }

  // POST /api/admin/render/:deviceId — trigger render for a single device
  const singleRenderMatch = path.match(/^\/api\/admin\/render\/(\w+)$/);
  if (singleRenderMatch && request.method === "POST") {
    const deviceId = singleRenderMatch[1];
    const device = DEVICES.find((d) => d.id === deviceId);
    if (!device) {
      return Response.json(
        { error: `Unknown device: ${deviceId}` },
        { status: 404, headers: corsHeaders },
      );
    }
    ctx.waitUntil(renderAllDevices(env, deviceId));
    return Response.json(
      { status: "ok", message: `Render pipeline triggered for ${device.name}` },
      { headers: corsHeaders },
    );
  }

  return Response.json(
    { error: "Not found" },
    { status: 404, headers: corsHeaders },
  );
}
