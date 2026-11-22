// ============================================================
// GET /media/* — Stream rendered PNG images from R2
// ============================================================

import { DEVICES } from "../devices";

// Media serving is public (TRMNL clients fetch it without auth). Restrict
// filenames to a conservative basename pattern so the R2 key space stays
// bounded to the device profiles and a simple `renders/<name>` namespace.
const FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export async function handleMediaRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);

  // Extract the filename from /media/<filename>
  const filename = url.pathname.replace(/^\/media\//, "");
  if (!filename) {
    return new Response("Bad Request: missing filename", { status: 400 });
  }

  // Reject anything that isn't a safe basename
  if (!FILENAME_PATTERN.test(filename)) {
    return new Response("Not Found: image does not exist", { status: 404 });
  }

  // Resolve the R2 key — look up by filename against device profiles,
  // falling back to a direct "renders/<filename>" path
  const device = DEVICES.find((d) => d.r2Key.endsWith(filename));
  const r2Key = device ? device.r2Key : `renders/${filename}`;

  // Fetch from R2
  const object = await env.DISPLAY_ASSETS.get(r2Key);
  if (!object) {
    return new Response("Not Found: image does not exist", { status: 404 });
  }

  return new Response(object.body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60, no-transform",
      "Content-Length": object.size.toString(),
      "ETag": object.httpEtag,
    },
  });
}
