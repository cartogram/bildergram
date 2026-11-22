// ============================================================
// Rendering Pipeline — Scheduler & Orchestrator
// Handles cron triggers and coordinates per-device rendering.
// ============================================================

import type { AppEnv, RenderMetadata } from "../types";
import { DEVICES, getDeviceById } from "../devices";
import { aggregateDeviceData } from "../data/aggregate";
import { renderDeviceImage } from "./renderer";

// ============================================================
// R2 user metadata — kept under Cloudflare's size limit
// ============================================================

/** R2 caps object user metadata near 2KB (error 10012 when exceeded). */
export const METADATA_MAX_BYTES = 1150;

const CACHED_KEYS = ["cachedWeather", "cachedForecast", "cachedEvents", "cachedTasks"] as const;

/**
 * Shrink or drop the cached-data blobs until the serialized metadata
 * fits R2's limit. Fixed fields (renderedAt, renderCount, ...) are never
 * trimmed — the live render always carries the full data; the cached
 * blobs only help if a source later fails.
 */
export function fitMetadata(meta: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...meta };
  while (JSON.stringify(out).length > METADATA_MAX_BYTES) {
    const key = [...CACHED_KEYS]
      .filter((k) => out[k])
      .sort((a, b) => out[b].length - out[a].length)[0];
    if (!key) break; // only fixed fields remain — nothing more we can trim
    const half = Math.max(0, Math.floor(out[key].length / 2));
    if (half === 0) delete out[key];
    else out[key] = out[key].slice(0, half);
  }
  return out;
}

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
  env: AppEnv,
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
        // Phase 3: aggregate per-device data from the configured sources
        // (weather / calendar / tasks) with cached-data fallbacks.
        const dashboard = await aggregateDeviceData(device, env);
        const pngBuffer = await renderDeviceImage(device, dashboard);
        const hadErrors = Object.values(dashboard.errors).some((v) => v === true);
        const renderedAt = Math.floor(Date.now() / 1000);

        // Phase 4: track render history in the metadata (renders happen
        // every 15 min per device — two renders may race; accept the race).
        const head = await env.DISPLAY_ASSETS.head(device.r2Key);
        const prevCount = parseInt(head?.customMetadata?.renderCount ?? "0", 10);
        const renderCount = (Number.isNaN(prevCount) ? 0 : prevCount + 1).toString();

        // Write to R2 with metadata — fitMetadata trims the cached
        // blobs so the metadata stays under R2's user-metadata limit.
        const metadata = {
          renderedAt: renderedAt.toString(),
          deviceId: device.id,
          fileSize: pngBuffer.byteLength.toString(),
          layout: device.layout,
          hadErrors: hadErrors ? "true" : "false",
          renderCount,
          lastOutcome: "ok",
          lastError: "",
          // Cache the last-known data per source so failed sources can
          // still be displayed later (with a warning icon).
          cachedWeather: dashboard.weather ? JSON.stringify(dashboard.weather) : "",
          cachedForecast: dashboard.forecast?.length ? JSON.stringify(dashboard.forecast) : "",
          cachedEvents: dashboard.events?.length ? JSON.stringify(dashboard.events) : "",
          cachedTasks: dashboard.tasks?.length ? JSON.stringify(dashboard.tasks) : "",
        } satisfies Record<keyof RenderMetadata, string>;
        await env.DISPLAY_ASSETS.put(device.r2Key, pngBuffer, {
          httpMetadata: { contentType: "image/png" },
          customMetadata: fitMetadata(metadata),
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
        // R2 doesn't support metadata-only updates, so the error is recorded
        // by re-putting the object with updated metadata. If no image exists
        // yet, the device sees a 404 from /api/display until the next
        // successful render.
        const existing = await env.DISPLAY_ASSETS.get(device.r2Key);
        if (existing) {
          console.log(
            `[render] Keeping stale image for ${device.name} (last rendered: ${existing.customMetadata?.renderedAt})`,
          );
          const message = err instanceof Error ? err.message : String(err);
          await env.DISPLAY_ASSETS.put(device.r2Key, existing.body, {
            httpMetadata: { contentType: "image/png" },
            customMetadata: fitMetadata({
              ...(existing.customMetadata ?? {}),
              hadErrors: "true",
              lastOutcome: "error",
              lastError: message,
            }),
          });
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
