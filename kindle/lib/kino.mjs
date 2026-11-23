// ============================================================
// kindle/lib/kino.mjs — Yorck cinema programme (fetch + parse)
// The IM KINO layout lives in kindle/lib/modules/kino.mjs.
//
// Data: each yorck.de cinema page (/kinos/<slug>) embeds its whole
// programme (~100 KB) as Next.js JSON: films with their sessions
// (start time with Berlin offset, formats like OmU/OV/OmeU). The
// programme is published a few days ahead; the new cinema week
// (Thursday) appears early in the week.
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

/** One cinema's programme: { slug, name, sessions: [{ date, time, title, formats, runtime }] } */
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
      sessions.push({ date: m[1], time: m[2], title: f.title ?? "?", formats: sf.formats ?? [], runtime: f.runtime });
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
