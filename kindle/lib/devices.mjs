// ============================================================
// kindle/lib/devices.mjs — the Kindles (Phase 10)
// Screens are designed on one 1448 × 1072 landscape canvas
// (design.mjs) and rendered at each device's panel size: the
// Paperwhite 2 has the same 1.35:1 shape, so the same SVG scales
// down cleanly. `rotate` turns landscape into the portrait
// framebuffer (eips pastes pixels as-is).
//
// `schedule` is the default until the first check-in; the two never show
// the same screen at once (src/routes/kindle.ts enforces it on save).
// Keep ids in sync with src/devices.ts (tokens, MACs).
// ============================================================

export const DEVICES = {
  kindle_01: { name: "Matt (Paperwhite 3)", width: 1448, height: 1072, rotate: "ccw", schedule: "0600:morgen 0900:tag 1815:abend 2300:nacht" },
  kindle_02: { name: "Fiona (Paperwhite 2)", width: 1024, height: 758, rotate: "ccw", schedule: "0900:morgen 1815:nacht 2300:tag" },
};

export const DEFAULT_DEVICE = "kindle_01";

export function device(id = DEFAULT_DEVICE) {
  const d = DEVICES[id];
  if (!d) throw new Error(`unknown device: ${id}`);
  return { id, ...d };
}
