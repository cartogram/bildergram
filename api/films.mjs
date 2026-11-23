// ============================================================
// Vercel function: films in the coming days (Phase 11)
//
//   GET /api/films?cinemas=rollberg,passage&letterboxd=<user>
//     → { films: [{ slug, title, dates, tmdbId, seen }], watched, fetchedAt }
//
// For the admin page's film list: every film with screenings at the
// chosen cinemas from today on, marked `seen` when its TMDB id is in the
// user's Letterboxd feed. Called by the Worker hub with
// `x-renderer-token` = RENDERER_TOKEN, like api/screen.mjs.
// ============================================================

import { berlinDate } from "../kindle/lib/render.mjs";
import { fetchProgramme, fetchTmdbId, fetchWatched, filmsOf } from "../kindle/lib/kino.mjs";

export async function GET(request) {
  const token = process.env.RENDERER_TOKEN;
  if (token && request.headers.get("x-renderer-token") !== token) {
    return new Response("unauthorized", { status: 401 });
  }
  const q = new URL(request.url).searchParams;
  const cinemas = (q.get("cinemas") ?? "rollberg,passage,neues-off").split(",").map((s) => s.trim()).filter((s) => /^[a-z0-9-]+$/.test(s));
  const letterboxd = /^[A-Za-z0-9_]{1,40}$/.test(q.get("letterboxd") ?? "") ? q.get("letterboxd") : null;

  try {
    const today = berlinDate();
    const [programme, watched] = await Promise.all([
      fetchProgramme(cinemas),
      letterboxd ? fetchWatched(letterboxd) : Promise.resolve(null),
    ]);
    const films = filmsOf(programme, (s) => s.date >= today);
    const ids = await Promise.all(films.map((f) => fetchTmdbId(f.slug).catch(() => null)));
    const out = films
      .map((f, i) => ({ ...f, tmdbId: ids[i], seen: Boolean(watched && ids[i] && watched.has(ids[i])) }))
      .sort((a, b) => a.title.localeCompare(b.title, "de"));
    return Response.json({ films: out, watched: watched ? watched.size : null, fetchedAt: programme.fetchedAt });
  } catch (err) {
    console.error("[films] failed:", err);
    return new Response(`films failed: ${err instanceof Error ? err.message : String(err)}`, { status: 502 });
  }
}
