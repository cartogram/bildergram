// ============================================================
// Shared hub helpers: JSON state in R2 and the admin token check.
// ============================================================

import type { AppEnv } from "./types";

export async function readJson<T>(env: AppEnv, key: string): Promise<T | null> {
  const obj = await env.DISPLAY_ASSETS.get(key);
  if (!obj) return null;
  try {
    return (await obj.json()) as T;
  } catch {
    return null;
  }
}

export async function writeJson(env: AppEnv, key: string, value: unknown): Promise<void> {
  await env.DISPLAY_ASSETS.put(key, JSON.stringify(value), {
    httpMetadata: { contentType: "application/json" },
  });
}

/** null when the request carries the admin token, else the error response. */
export function adminAuthorized(request: Request, env: AppEnv): Response | null {
  if (!env.ADMIN_TOKEN) return Response.json({ error: "ADMIN_TOKEN is not set on the Worker" }, { status: 503 });
  const auth = request.headers.get("Authorization") ?? "";
  if (auth !== `Bearer ${env.ADMIN_TOKEN}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

/** Berlin calendar date (YYYY-MM-DD) of an epoch in ms. */
export const berlinDate = (ms = Date.now()) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
