// ============================================================
// Rendering Pipeline — SVG → PNG Image Generator (Phase 3)
// Draws the dashboard layout onto a pure-JS bitmap canvas
// (./draw) from aggregated DashboardData, then encodes the
// bitmap as a 1-bit grayscale PNG (./eink). No rasteriser
// or remote fonts are required — the bitmap font lives in
// ./glyphs (generated from assets/fonts/Arimo.ttf via
// tools/gen-glyphs.mjs).
// ============================================================

import type { DashboardData, DeviceConfig } from "../types";
import { Bitmap } from "./bitmap";
import { drawDashboard } from "./draw";
import { encodeGray1Png } from "./eink";

export async function renderDeviceImage(
  device: DeviceConfig,
  data: DashboardData,
): Promise<ArrayBuffer> {
  const bm = new Bitmap(device.width, device.height);
  drawDashboard(bm, device, data);
  return encodeGray1Png(device.width, device.height, bm.data);
}
