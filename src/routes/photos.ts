// ============================================================
// Photos (Phase 17) — the Foto tile's pictures.
//
// The admin page prepares each photo in the browser (cropped to the tile,
// grayscale, dithered to the panel's 16 grays, as a PNG) and uploads it
// here; the hub keeps them in R2, shared by both Kindles. Each screen with
// a Foto tile shows one photo a day, picked per Kindle and date, and the
// renderer fetches it from the hub with its token.
//
//   GET    /api/admin/photos              [{ id, name, added }]
//   POST   /api/admin/photos?name=        body: the PNG → { id }
//   GET    /api/admin/photos/<id>.png     the photo (for the admin page)
//   DELETE /api/admin/photos/<id>
//   GET    /api/photos/<id>.png           the photo, for the renderer (x-renderer-token)
// ============================================================

import { adminAuthorized, readJson, writeJson } from "../state";
import type { AppEnv } from "../types";

export interface Photo {
  id: string;
  name: string;
  added: string;
}

const INDEX = "photos/index.json";
const blobKey = (id: string) => `photos/${id}.png`;
/** Uploads are small dithered PNGs (the tile's pixels); anything much bigger is a mistake. */
const MAX_BYTES = 2_000_000;
const ID = /^[a-z0-9]{8,32}$/;

const listPhotos = async (env: AppEnv): Promise<Photo[]> => (await readJson<Photo[]>(env, INDEX)) ?? [];

/**
 * The photo a Kindle shows on `date` (YYYY-MM-DD): one of the uploads,
 * the same all day, a different one per Kindle where there are several.
 * Null when there are none.
 */
export async function photoFor(env: AppEnv, device: string, date: string): Promise<string | null> {
  const photos = await listPhotos(env);
  if (!photos.length) return null;
  let h = 0;
  for (const ch of `${device}:${date}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return photos[h % photos.length].id;
}

const png = (body: ReadableStream | ArrayBuffer | null) =>
  new Response(body, { headers: { "content-type": "image/png", "cache-control": "no-store" } });

/** The admin endpoints (/api/admin/photos…). */
export async function handlePhotosAdmin(request: Request, env: AppEnv): Promise<Response> {
  const denied = adminAuthorized(request, env);
  if (denied) return denied;
  const url = new URL(request.url);
  const one = url.pathname.match(/^\/api\/admin\/photos\/([a-z0-9]+)(\.png)?$/);

  if (url.pathname === "/api/admin/photos" && request.method === "GET") {
    return Response.json(await listPhotos(env));
  }
  if (url.pathname === "/api/admin/photos" && request.method === "POST") {
    const body = await request.arrayBuffer();
    const sig = new Uint8Array(body.slice(0, 8));
    const isPng = sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47;
    if (!isPng) return Response.json({ error: "expected a PNG" }, { status: 400 });
    if (body.byteLength > MAX_BYTES) return Response.json({ error: "too large" }, { status: 413 });
    const id = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    const name = (url.searchParams.get("name") ?? "").slice(0, 80);
    await env.DISPLAY_ASSETS.put(blobKey(id), body, { httpMetadata: { contentType: "image/png" } });
    const photos = await listPhotos(env);
    photos.push({ id, name, added: new Date().toISOString() });
    await writeJson(env, INDEX, photos);
    return Response.json({ id });
  }
  if (one && ID.test(one[1]) && request.method === "GET") {
    const obj = await env.DISPLAY_ASSETS.get(blobKey(one[1]));
    return obj ? png(obj.body) : Response.json({ error: "not found" }, { status: 404 });
  }
  if (one && ID.test(one[1]) && request.method === "DELETE") {
    await env.DISPLAY_ASSETS.delete(blobKey(one[1]));
    await writeJson(env, INDEX, (await listPhotos(env)).filter((p) => p.id !== one[1]));
    return Response.json({ ok: true });
  }
  return Response.json({ error: "not found" }, { status: 404 });
}

/** The renderer's endpoint (/api/photos/<id>.png), checked against RENDERER_TOKEN. */
export async function handlePhotoForRenderer(request: Request, env: AppEnv): Promise<Response> {
  if (!env.RENDERER_TOKEN || request.headers.get("x-renderer-token") !== env.RENDERER_TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const m = new URL(request.url).pathname.match(/^\/api\/photos\/([a-z0-9]+)\.png$/);
  if (!m || !ID.test(m[1])) return Response.json({ error: "not found" }, { status: 404 });
  const obj = await env.DISPLAY_ASSETS.get(blobKey(m[1]));
  return obj ? png(obj.body) : Response.json({ error: "not found" }, { status: 404 });
}
