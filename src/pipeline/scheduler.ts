// ============================================================
// Rendering Pipeline — Scheduler & Orchestrator
// Handles cron triggers and coordinates per-device rendering.
// ============================================================

import type { RenderMetadata } from "../types";
import { DEVICES, getDeviceById } from "../devices";
import { renderDeviceImage } from "./renderer";

/**
 * Cron trigger handler.
 * Iterates all registered devices and renders their dashboard images
 * independently so a failure in one device does not block others.
 */
export async function handleCronTrigger(
  controller: ScheduledController,
  env: Env,
): Promise<void> {
  console.log(`[cron] Triggered at ${new Date(controller.scheduledTime).toISOString()}`);
  await renderAllDevices(env);
}

/**
 * Render images for all devices (or a single device if `deviceId` is specified).
 * Each device renders independently with error isolation.
 */
export async function renderAllDevices(
  env: Env,
  deviceId?: string,
): Promise<void> {
  const targets = deviceId
    ? DEVICES.filter((d) => d.id === deviceId)
    : DEVICES;

  const results = await Promise.allSettled(
    targets.map(async (device) => {
      console.log(`[render] Starting render for ${device.name} (${device.id})`);
      const startTime = Date.now();

      try {
        const pngBuffer = await renderDeviceImage(device, env);
        const renderedAt = Math.floor(Date.now() / 1000);

        // Write to R2 with metadata
        await env.DISPLAY_ASSETS.put(device.r2Key, pngBuffer, {
          httpMetadata: { contentType: "image/png" },
          customMetadata: {
            renderedAt: renderedAt.toString(),
            deviceId: device.id,
            fileSize: pngBuffer.byteLength.toString(),
            layout: device.layout,
            hadErrors: "false",
          } satisfies Record<keyof RenderMetadata, string>,
        });

        const elapsed = Date.now() - startTime;
        console.log(
          `[render] ✓ ${device.name}: ${pngBuffer.byteLength} bytes in ${elapsed}ms → ${device.r2Key}`,
        );
      } catch (err) {
        const elapsed = Date.now() - startTime;
        console.error(
          `[render] ✗ ${device.name} failed after ${elapsed}ms:`,
          err,
        );

        // Graceful degradation: if a stale image exists, keep serving it —
        // R2 doesn't support metadata-only updates, so the error can't be
        // flagged on the object itself. If no image exists yet, the device
        // sees a 404 from /api/display until the next successful render.
        const existing = await env.DISPLAY_ASSETS.head(device.r2Key);
        if (existing) {
          console.log(
            `[render] Keeping stale image for ${device.name} (last rendered: ${existing.customMetadata?.renderedAt})`,
          );
        }
      }
    }),
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  console.log(
    `[render] Complete: ${succeeded} succeeded, ${failed} failed out of ${targets.length} devices`,
  );
}
