// ============================================================
// Shared cached-data reader (Phase 3)
// Reads JSON-string cached dashboard data from R2 metadata.
// ============================================================

import type { AppEnv, DeviceConfig, RenderMetadata } from "../types";

export async function readCached<T>(
  env: AppEnv,
  device: DeviceConfig,
  metadataKey: keyof RenderMetadata,
): Promise<T | null> {
  const head = await env.DISPLAY_ASSETS.head(device.r2Key);
  const raw = head?.customMetadata?.[metadataKey];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) || (parsed !== null && typeof parsed === "object")) {
      return parsed as T;
    }
  } catch {
    // Corrupt or foreign metadata — treat as unavailable.
  }
  return null;
}
