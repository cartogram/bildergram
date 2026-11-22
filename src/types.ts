// ============================================================
// Shared type definitions
// ============================================================

/** Configuration for a single managed display device */
export interface DeviceConfig {
  /** Internal device identifier */
  id: string;
  /** Human-readable device name */
  name: string;
  /** MAC address used in the ID header */
  macAddress: string;
  /** Environment variable name holding this device's API token */
  tokenEnvKey: string;
  /** Display width in pixels */
  width: number;
  /** Display height in pixels */
  height: number;
  /** "landscape" | "portrait" */
  orientation: "landscape" | "portrait";
  /** Default refresh rate in seconds */
  refreshRate: number;
  /** Active layout template name */
  layout: string;
  /** R2 object key for the latest rendered image */
  r2Key: string;
}

/** TRMNL-compliant /api/display JSON response */
export interface DisplayResponse {
  status: number;
  image_url: string;
  filename: string;
  refresh_rate: number;
  reset_firmware: boolean;
  update_firmware: boolean;
}

/** Render metadata stored alongside each image in R2 */
export interface RenderMetadata {
  /** Unix timestamp (seconds) when the image was generated */
  renderedAt: number;
  /** Device ID this image was rendered for */
  deviceId: string;
  /** File size in bytes */
  fileSize: number;
  /** Layout template used */
  layout: string;
  /** Whether the render encountered any upstream errors */
  hadErrors: boolean;
}
