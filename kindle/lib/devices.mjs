// ============================================================
// kindle/lib/devices.mjs — the Kindles (Phase 10)
// Screens are designed on one 1448 × 1072 landscape canvas
// (design.mjs) and rendered at each device's panel size: the
// Paperwhite 2 has the same 1.35:1 shape, so the same SVG scales
// down cleanly. `rotate` turns landscape into the portrait
// framebuffer (eips pastes pixels as-is).
//
// `screen` is the one screen a Kindle shows until its first check-in
// sets it from the hub (src/routes/kindle.ts); both show "home" for now.
// Keep ids in sync with src/devices.ts (tokens, MACs).
// ============================================================

export const DEVICES = {
  kindle_01: { name: "Matt (Paperwhite 3)", width: 1448, height: 1072, rotate: "ccw", screen: "home" },
  kindle_02: { name: "Fiona (Paperwhite 2)", width: 1024, height: 758, rotate: "ccw", screen: "home" },
};

export const DEFAULT_DEVICE = "kindle_01";

export function device(id = DEFAULT_DEVICE) {
  const d = DEVICES[id];
  if (!d) throw new Error(`unknown device: ${id}`);
  return { id, ...d };
}
