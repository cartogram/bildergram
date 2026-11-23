// ============================================================
// Device registry & authentication
// Each Kindle sends its token (Worker secret named by
// tokenEnvKey) as `Access-Token` or `Authorization: Bearer`,
// and optionally its Wi-Fi MAC as `ID`.
// ============================================================

export interface DeviceConfig {
  /** Internal device identifier */
  id: string;
  /** Human-readable device name */
  name: string;
  /** Wi-Fi MAC address; must match the `ID` header when one is sent */
  macAddress: string;
  /** Name of the Worker secret holding this device's token */
  tokenEnvKey: string;
}

export const DEVICES: DeviceConfig[] = [
  {
    id: "kindle_01",
    name: "Kindle Paperwhite 3",
    macAddress: "74:75:48:81:93:FA",
    tokenEnvKey: "DEVICE_TOKEN_KINDLE_01",
  },
];

/** The device a request authenticates as, or null. */
export function authenticateDevice(request: Request, env: object): DeviceConfig | null {
  const accessToken = request.headers.get("Access-Token");
  const authHeader = request.headers.get("Authorization");
  const token = accessToken || (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
  if (!token) return null;

  const deviceMac = request.headers.get("ID");
  for (const device of DEVICES) {
    const expected = (env as unknown as Record<string, unknown>)[device.tokenEnvKey];
    if (typeof expected !== "string" || !expected || token !== expected) continue;
    if (deviceMac && deviceMac.toUpperCase() !== device.macAddress) continue;
    return device;
  }
  return null;
}
