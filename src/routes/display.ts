// ============================================================
// GET /api/display — TRMNL Display API
// Authenticates the device and returns a JSON payload pointing
// to the latest pre-rendered e-ink image in R2.
// ============================================================

import { authenticateDevice } from "../devices";
import type { DisplayResponse, RenderMetadata } from "../types";

export async function handleDisplayRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  // 1. Authenticate & resolve device
  const device = authenticateDevice(request, env);

  if (!device) {
    return Response.json(
      { status: 401, error: "Unauthorized: invalid or missing device token" },
      { status: 401 },
    );
  }

  // 2. Check if a rendered image exists in R2
  const r2Head = await env.DISPLAY_ASSETS.head(device.r2Key);

  if (!r2Head) {
    return Response.json(
      {
        status: 404,
        error: `No rendered image available for device "${device.name}" (${device.id}). The rendering pipeline may not have run yet.`,
      },
      { status: 404 },
    );
  }

  // 3. Build the TRMNL-compliant response
  const renderMeta = r2Head.customMetadata as unknown as Record<string, string>;
  const renderedAt = renderMeta?.renderedAt
    ? parseInt(renderMeta.renderedAt, 10)
    : Math.floor(Date.now() / 1000);

  const origin = new URL(request.url).origin;
  const filename = device.r2Key.split("/").pop()!;
  const imageUrl = `${origin}/media/${filename}?v=${renderedAt}`;

  const payload: DisplayResponse = {
    status: 200,
    image_url: imageUrl,
    filename,
    refresh_rate: device.refreshRate,
    reset_firmware: false,
    update_firmware: false,
  };

  return Response.json(payload, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "X-Device-Id": device.id,
    },
  });
}
