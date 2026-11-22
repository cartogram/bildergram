// ============================================================
// GET /media/* — Stream rendered PNG images from R2
// ============================================================

import { DEVICES } from "../devices";

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
