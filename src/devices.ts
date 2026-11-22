// ============================================================
// Device Registry
// Maps device identifiers → configuration profiles.
// In production, tokens come from Cloudflare Worker Secrets.
// ============================================================

import type { DeviceConfig } from "./types";

/**
 * Static device profile matrix.
 * Each entry defines the full rendering and serving configuration
 * for one Kindle display target.
 */
export const DEVICES: DeviceConfig[] = [
  {
    id: "kindle_01",
    name: "Kitchen Display",
    macAddress: "AA:BB:CC:DD:EE:01",
    tokenEnvKey: "DEVICE_TOKEN_KINDLE_01",
    width: 1024,
    height: 758,
    orientation: "landscape",
    refreshRate: 900,     // 15 minutes
    layout: "household-overview",
    r2Key: "renders/kindle_01_latest.png",
    weatherCity: "Berlin",
    calendarIcsUrlEnvKey: "APPLE_CALENDAR_ICS_URL_01",
  },
  {
    id: "kindle_02",
    name: "Office Display",
    macAddress: "AA:BB:CC:DD:EE:02",
    tokenEnvKey: "DEVICE_TOKEN_KINDLE_02",
    width: 1440,
    height: 1080,
    orientation: "portrait",
    refreshRate: 1800,    // 30 minutes
    layout: "productivity",
    r2Key: "renders/kindle_02_latest.png",
    calendarId: "primary",
    tasksEnabled: true,
  },
];

/**
 * Authenticate an incoming request and resolve the matching device.
 * Returns `null` if the token is invalid or the device is unknown.
 */
export function authenticateDevice(
  request: Request,
  env: Env,
): DeviceConfig | null {
  // Extract token from Access-Token header or Authorization: Bearer
  const accessToken = request.headers.get("Access-Token");
  const authHeader = request.headers.get("Authorization");
  const token =
    accessToken || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);

  if (!token) return null;

  // Extract device MAC from ID header
  const deviceMac = request.headers.get("ID");

  for (const device of DEVICES) {
    const expectedToken = (env as unknown as Record<string, unknown>)[device.tokenEnvKey] as string | undefined;
    if (!expectedToken) continue;

    // Match by token; optionally narrow by MAC address if provided
    if (token === expectedToken) {
      if (deviceMac && deviceMac !== device.macAddress) continue;
      return device;
    }
  }

  return null;
}

/** Look up a device by its ID string */
export function getDeviceById(id: string): DeviceConfig | undefined {
  return DEVICES.find((d) => d.id === id);
}
