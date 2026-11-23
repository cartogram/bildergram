// ============================================================
// kindle/lib/kino.mjs — Yorck cinema programme (fetch + parse) and
// the Letterboxd "already seen" filter (Phase 11).
// The IM KINO layout lives in kindle/lib/modules/kino.mjs.
//
// Data: each yorck.de cinema page (/kinos/<slug>) embeds its whole
// programme (~100 KB) as Next.js JSON: films with their sessions
// (start time with Berlin offset, formats like OmU/OV/OmeU). The
// programme is published a few days ahead; the new cinema week
// (Thursday) appears early in the week.
//
// Seen films: the public Letterboxd RSS feed (letterboxd.com/<user>/rss/)
// lists recently logged films with their TMDB id; each Yorck film page
// (/filme/<slug>) has the film's TMDB id. Films match by id (Yorck uses
// German titles). Specials without a TMDB id are never hidden.
// ============================================================

export const DEFAULT_CINEMAS = ["rollberg", "passage", "neues-off"];
const USER_AGENT = "bildergram/1.0 (personal e-ink cinema listing)";

// ------------------------------------------------------------------
// Fetch + parse
// ------------------------------------------------------------------

function nextData(html, url) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error(`no __NEXT_DATA__ in ${url}`);
  return JSON.parse(m[1]);
}

/** One cinema's programme: { slug, name, sessions: [{ date, time, title, film, formats, runtime }] } */
export function parseCinemaPage(html, slug) {
  const pp = nextData(html, slug).props?.pageProps;
  const name = (pp?.cinema?.fields?.name ?? slug).trim();
  const sessions = [];
  for (const film of pp?.filmsSpecials ?? []) {
    const f = film.fields ?? {};
    for (const s of f.sessions ?? []) {
      const sf = s.fields ?? {};
      // startTime carries the Berlin offset, so its text is Berlin wall time.
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(sf.startTime ?? "");
      if (!m) continue;
      const at = sf.cinema?.fields?.name?.trim();
      if (at && at !== name) continue;
      sessions.push({
        date: m[1], time: m[2], title: f.title ?? "?", film: f.slug ?? null, formats: sf.formats ?? [], runtime: f.runtime,
      });
    }
  }
  sessions.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.title.localeCompare(b.title));
  return { slug, name, sessions };
}

export async function fetchProgramme(slugs = DEFAULT_CINEMAS) {
  const cinemas = await Promise.all(
    slugs.map(async (slug) => {
      const url = `https://www.yorck.de/kinos/${encodeURIComponent(slug)}`;
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`${url} returned ${res.status}`);
      return parseCinemaPage(await res.text(), slug);
    }),
  );
  return { cinemas, fetchedAt: new Date().toISOString() };
}

// ------------------------------------------------------------------
// Seen films (Letterboxd) and hidden films
// ------------------------------------------------------------------

// Kept for the life of the process (a Vercel instance lives minutes to
// hours): film ids never change, the feed is refreshed after 10 minutes.
const tmdbIds = new Map();
const feeds = new Map();
const FEED_TTL_MS = 10 * 60_000;

/** TMDB id of a Yorck film (from /filme/<slug>), or null (e.g. specials). */
export async function fetchTmdbId(slug) {
  if (tmdbIds.has(slug)) return tmdbIds.get(slug);
  const url = `https://www.yorck.de/filme/${encodeURIComponent(slug)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null; // not cached: try again next time
  const f = nextData(await res.text(), url).props?.pageProps?.film?.fields ?? {};
  const id = f.tmdbId ? String(f.tmdbId) : null;
  tmdbIds.set(slug, id);
  return id;
}

/** TMDB ids of the films in a user's public Letterboxd feed (recent diary entries). */
export async function fetchWatched(user) {
  const cached = feeds.get(user);
  if (cached && Date.now() - cached.at < FEED_TTL_MS) return cached.ids;
  const res = await fetch(`https://letterboxd.com/${encodeURIComponent(user)}/rss/`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Letterboxd feed for ${user} returned ${res.status}`);
  const xml = await res.text();
  const ids = new Set([...xml.matchAll(/<tmdb:movieId>(\d+)<\/tmdb:movieId>/g)].map((m) => m[1]));
  feeds.set(user, { at: Date.now(), ids });
  return ids;
}

/** Distinct films with sessions matching `keep(session)`: [{ slug, title, dates }]. */
export function filmsOf(programme, keep = () => true) {
  const films = new Map();
  for (const c of programme.cinemas) {
    for (const s of c.sessions) {
      if (!s.film || !keep(s)) continue;
      const f = films.get(s.film) ?? { slug: s.film, title: s.title, dates: new Set() };
      f.dates.add(s.date);
      films.set(s.film, f);
    }
  }
  return [...films.values()].map((f) => ({ ...f, dates: [...f.dates].sort() }));
}

/**
 * The programme without films the user has seen (Letterboxd) or hidden
 * by hand (Yorck slugs). Only films matching `keep` are looked up, so a
 * render fetches just the evening's film pages.
 */
export async function withoutSeen(programme, { letterboxd, hidden = [], keep = () => true } = {}) {
  const drop = new Set(hidden);
  if (letterboxd) {
    const watched = await fetchWatched(letterboxd);
    const films = filmsOf(programme, keep);
    const ids = await Promise.all(films.map((f) => fetchTmdbId(f.slug).catch(() => null)));
    films.forEach((f, i) => {
      if (ids[i] && watched.has(ids[i])) drop.add(f.slug);
    });
  }
  if (!drop.size) return programme;
  return {
    ...programme,
    cinemas: programme.cinemas.map((c) => ({ ...c, sessions: c.sessions.filter((s) => !drop.has(s.film)) })),
  };
}
