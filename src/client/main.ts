// ============================================================
// Admin SPA — Kindle dashboards (Phase 9–10; one screen each, Phase 15;
// Design, Phase 16)
// For each Kindle: shows its last check-in and battery history, edits
// its screen, check-in interval and cinemas, and previews the screen at
// its size. The Design view (#design) shows the tile design: tokens and
// every card, rendered by the renderer (kindle/lib/specimens.mjs). For both: the weekly exercise goals and each iPhone's
// last sync (Phase 12). Talks to /api/admin/* with the admin token (asked
// for once and kept in this browser's localStorage).
// ============================================================

import "./styles.css";

interface ScreenInfo {
  name: string;
  shows: string;
}

interface KindleConfig {
  screen: string;
  kino: { cinemas: string[]; from: string; letterboxdUser: string; hideSeen: boolean; hiddenFilms: string[] };
  checkinMinutes: number;
  exit: boolean;
}

interface KindleStatus {
  checkedInAt: string;
  reason: string;
  battery: number | null;
  charging: boolean;
  screen: string;
  version: string;
  log: string;
  history?: [number, number][];
}

interface FitnessPerson {
  id: string;
  name: string;
  goals: { day: number; week: number; year: number };
  totals: { day: number; week: number; year: number };
  tokenSet: boolean;
  days: Record<string, number>;
  syncedAt: string | null;
  receivedAt: string | null;
  lastPayload: string;
  lastResult: string;
}

interface FilmInfo {
  slug: string;
  title: string;
  dates: string[];
  tmdbId: string | null;
  seen: boolean;
}

interface AdminState {
  device: string;
  devices: { id: string; name: string }[];
  config: KindleConfig;
  status: KindleStatus | null;
  cinemas: Record<string, string>;
  screens: Record<string, ScreenInfo>;
}

const TOKEN_KEY = "bildergram-admin-token";
const DEVICE_KEY = "bildergram-admin-device";
const app = document.getElementById("app")!;
let draft: KindleConfig | null = null;
let previewUrl: string | null = null;
let previewScreen: string | null = null;

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private mode etc. — the token then lasts for this page only.
  }
  sessionToken = token;
}

let sessionToken = getToken();

function getDevice(): string {
  try {
    return localStorage.getItem(DEVICE_KEY) ?? "kindle_01";
  } catch {
    return "kindle_01";
  }
}

let currentDevice = getDevice();

function setDevice(id: string): void {
  currentDevice = id;
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    // Remembering the device is only a convenience.
  }
}

/** Admin API path with the selected device. */
const withDevice = (path: string) => `${path}${path.includes("?") ? "&" : "?"}device=${encodeURIComponent(currentDevice)}`;

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${sessionToken ?? ""}` },
  });
  if (res.status === 401) {
    setToken(null);
    renderLogin("That token was not accepted.");
    throw new Error("unauthorized");
  }
  return res;
}

function berlinTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function ago(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

// ------------------------------------------------------------------
// Views
// ------------------------------------------------------------------

function renderLogin(message = ""): void {
  app.innerHTML = `
    <main class="narrow">
      <h1>Kindle dashboard</h1>
      <form class="card" id="login">
        <label for="token">Admin token</label>
        <input id="token" type="password" autocomplete="current-password" required>
        ${message ? `<p class="error">${escapeHtml(message)}</p>` : ""}
        <button type="submit">Open</button>
        <p class="muted">The <code>ADMIN_TOKEN</code> Worker secret. It is kept in this browser only.</p>
      </form>
    </main>`;
  document.getElementById("login")!.addEventListener("submit", (e) => {
    e.preventDefault();
    setToken((document.getElementById("token") as HTMLInputElement).value.trim());
    route();
  });
}

/** Battery over the last week as an inline SVG line chart. */
function batteryChart(history: [number, number][]): string {
  if (history.length < 2) return `<p class="muted">The battery history fills in with each check-in.</p>`;
  const w = 640;
  const h = 120;
  const t0 = history[0][0];
  const t1 = history[history.length - 1][0];
  const span = Math.max(1, t1 - t0);
  const x = (t: number) => ((t - t0) / span) * w;
  const y = (b: number) => h - (b / 100) * h;
  const pts = history.map(([t, b]) => `${x(t).toFixed(1)},${y(b).toFixed(1)}`).join(" ");
  const days = Math.round(span / 86400);
  const first = history[0][1];
  const last = history[history.length - 1][1];
  const perDay = span > 6 * 3600 ? ((first - last) / span) * 86400 : null;
  return `
    <figure class="chart">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Battery from ${first}% to ${last}% over ${days || "<1"} days">
        <line x1="0" y1="${y(50)}" x2="${w}" y2="${y(50)}" class="grid"/>
        <line x1="0" y1="${y(20)}" x2="${w}" y2="${y(20)}" class="grid low"/>
        <polyline points="${pts}" class="line"/>
      </svg>
      <figcaption class="muted">Last ${days > 0 ? `${days} days` : "day"}: ${first}% → ${last}%${perDay !== null && perDay > 0 ? ` · about ${perDay.toFixed(1)}% a day` : ""} · dashed line at 20%</figcaption>
    </figure>`;
}

function statusHtml(s: KindleStatus | null): string {
  if (!s) {
    return `<p class="muted">No check-in yet. The Kindle checks in when it needs a screen, on the interval while weather is
      showing, and when you press its power button.</p>`;
  }
  return `
    <dl class="facts">
      <div><dt>Last check-in</dt><dd>${escapeHtml(ago(s.checkedInAt))} <span class="muted">(${escapeHtml(berlinTime(s.checkedInAt))}, ${escapeHtml(s.reason || "?")})</span></dd></div>
      <div><dt>Battery</dt><dd>${s.battery ?? "?"}%${s.charging ? " · charging" : ""}</dd></div>
      <div><dt>Screen</dt><dd>${escapeHtml(s.screen || "?")}</dd></div>
      <div><dt>Version</dt><dd><code>${escapeHtml(s.version || "?")}</code></dd></div>
    </dl>
    ${batteryChart(s.history ?? [])}
    <details><summary>Recent log (UTC)</summary><pre>${escapeHtml(s.log || "(empty)")}</pre></details>`;
}

function screenHtml(c: KindleConfig, screens: Record<string, ScreenInfo>): string {
  return `<label class="inline">Show
      <select id="screen" aria-label="Screen">
        ${Object.entries(screens).map(([id, s]) => `<option value="${id}" ${id === c.screen ? "selected" : ""}>${escapeHtml(s.name)} — ${escapeHtml(s.shows)}</option>`).join("")}
      </select></label>
    <p class="muted">The screen's cards change with the time of day themselves (the Feld countdown, tomorrow's films from 22:00).</p>
    <label class="inline">Check in every <input type="number" id="interval" min="15" max="360" step="15" value="${c.checkinMinutes}"> minutes</label>`;
}

function cinemasHtml(c: KindleConfig, cinemas: Record<string, string>): string {
  return `<div class="cinemas">${Object.entries(cinemas)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(
      ([slug, name]) => `<label class="check"><input type="checkbox" value="${slug}" ${c.kino.cinemas.includes(slug) ? "checked" : ""}> ${escapeHtml(name)}</label>`,
    )
    .join("")}</div>
    <label class="inline">List screenings from <input type="time" id="kino-from" value="${c.kino.from}"></label>

    <h2>Films</h2>
    <label class="inline">Letterboxd username <input type="text" id="lbx-user" value="${escapeHtml(c.kino.letterboxdUser)}" placeholder="optional" autocomplete="off" spellcheck="false"></label>
    <label class="check"><input type="checkbox" id="lbx-hide" ${c.kino.hideSeen ? "checked" : ""}> Leave out films I've logged on Letterboxd</label>
    <p class="muted">Matched by TMDB id from your public Letterboxd feed (your recent diary). Tick a film below to hide it by hand.</p>
    <div id="films" class="films"><p class="muted">Loading films…</p></div>`;
}

/** Short German-style date list: "24.11., 25.11., 26.11. … (9 days)". */
function filmDates(dates: string[]): string {
  const fmt = (d: string) => `${Number(d.slice(8, 10))}.${Number(d.slice(5, 7))}.`;
  return dates.length <= 3 ? dates.map(fmt).join(", ") : `${dates.slice(0, 2).map(fmt).join(", ")} … ${fmt(dates[dates.length - 1])} (${dates.length} days)`;
}

async function loadFilms(): Promise<void> {
  const box = document.getElementById("films");
  if (!box || !draft) return;
  try {
    const res = await api(withDevice("/api/admin/kindle/films"));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const body = (await res.json()) as { films: FilmInfo[]; watched: number | null };
    const hidden = new Set(draft.kino.hiddenFilms);
    const note = body.watched === null
      ? "Add a Letterboxd username (and save) to mark films you've seen."
      : `${body.watched} films in the Letterboxd feed; ${body.films.filter((f) => f.seen).length} of these are among them.`;
    box.innerHTML = `<p class="muted">${escapeHtml(note)}</p><ul class="film-list">${body.films
      .map((f) => `<li><label class="check"><input type="checkbox" data-film="${escapeHtml(f.slug)}" ${hidden.has(f.slug) ? "checked" : ""}>
          <span class="film-title">${escapeHtml(f.title)}</span></label>
          <span class="muted">${escapeHtml(filmDates(f.dates))}</span>
          ${f.seen ? `<span class="badge">seen</span>` : ""}${f.tmdbId ? "" : `<span class="muted">special</span>`}</li>`)
      .join("")}</ul>`;
  } catch (err) {
    if ((err as Error).message === "unauthorized") return;
    box.innerHTML = `<p class="error">Films unavailable: ${escapeHtml((err as Error).message)}</p>`;
  }
}

function render(state: AdminState): void {
  draft ??= structuredClone(state.config);
  const c = draft;
  previewScreen ??= state.config.screen;
  app.innerHTML = `
    <main>
      <header class="top">
        <h1>Kindle dashboard</h1>
        ${navHtml("kindles")}
        <div class="tabs" role="tablist" aria-label="Kindle">
          ${state.devices.map((d) => `<button type="button" role="tab" class="tab device-tab" data-device="${d.id}" aria-selected="${d.id === state.device}">${escapeHtml(d.name)}</button>`).join("")}
        </div>
        <button type="button" class="ghost" id="logout">Forget token</button>
      </header>

      <section class="card">
        <h2>Status</h2>
        ${statusHtml(state.status)}
      </section>

      <form class="card" id="config">
        <h2>Screen</h2>
        ${screenHtml(c, state.screens)}

        <h2>Cinemas</h2>
        ${cinemasHtml(c, state.cinemas)}

        <h2>Kindle UI</h2>
        <label class="check"><input type="checkbox" id="exit" ${c.exit ? "checked" : ""}> Return to the normal Kindle UI at the next check-in</label>

        <div class="actions">
          <button type="submit">Save</button>
          <span id="save-msg" class="muted">Changes reach the Kindle at its next check-in. Press its power button to apply them now.</span>
        </div>
      </form>

      <form class="card" id="fitness">
        <h2>Fitness <span class="muted">(both Kindles)</span></h2>
        <div id="fitness-body"><p class="muted">Loading…</p></div>
      </form>

      <section class="card">
        <div class="row">
          <h2>Preview</h2>
          <div class="tabs" role="tablist">
            ${Object.entries(state.screens).map(([id, s]) => `<button type="button" role="tab" class="tab" data-screen="${id}" aria-selected="${id === previewScreen}">${escapeHtml(s.name)}</button>`).join("")}
          </div>
        </div>
        <div id="preview" class="preview"><p class="muted">Loading…</p></div>
      </section>
    </main>`;

  bindForm(state);
  for (const t of document.querySelectorAll<HTMLButtonElement>(".device-tab")) {
    t.addEventListener("click", () => {
      if (t.dataset.device === currentDevice) return;
      setDevice(t.dataset.device!);
      previewScreen = null;
      void load();
    });
  }
  for (const t of document.querySelectorAll<HTMLButtonElement>(".tab:not(.device-tab)")) {
    t.addEventListener("click", () => {
      previewScreen = t.dataset.screen!;
      for (const x of document.querySelectorAll(".tab:not(.device-tab)")) x.setAttribute("aria-selected", String(x === t));
      void loadPreview(state);
    });
  }
  void loadPreview(state);
  void loadFilms();
  void loadFitness();
}

// ------------------------------------------------------------------
// Fitness (shared by both Kindles)
// ------------------------------------------------------------------

function fitnessHtml(people: FitnessPerson[]): string {
  const rows = people.map((p) => {
    const synced = p.syncedAt ? `${escapeHtml(berlinTime(p.syncedAt))} (${ago(p.syncedAt)})` : "never";
    const last = p.receivedAt
      ? `<details><summary class="muted">Last post ${escapeHtml(ago(p.receivedAt))}: ${escapeHtml(p.lastResult)}</summary><pre class="log">${escapeHtml(p.lastPayload || "(empty body)")}</pre></details>`
      : "";
    return `<div class="person">
        <div class="row"><strong>${escapeHtml(p.name)}</strong><span class="muted">today ${p.totals.day} / ${p.goals.day} · week ${p.totals.week} / ${p.goals.week} · year ${p.totals.year} / ${p.goals.year} min</span></div>
        <div class="goals">
          <label class="inline">Day <input type="number" min="5" max="600" step="5" data-goal="${p.id}:day" value="${p.goals.day}"></label>
          <label class="inline">Week <input type="number" min="10" max="3000" step="5" data-goal="${p.id}:week" value="${p.goals.week}"></label>
          <label class="inline">Year <input type="number" min="100" max="100000" step="100" data-goal="${p.id}:year" value="${p.goals.year}"></label>
          <span class="muted">minutes</span>
        </div>
        <p class="muted">Last sync: ${synced}${p.tokenSet ? "" : " · <strong>no token set on the Worker</strong>"}</p>
        ${last}
      </div>`;
  });
  return `${rows.join("")}
    <p class="muted">Exercise minutes (the green ring) from each iPhone's Shortcut, posted to <code>${escapeHtml(location.origin)}/api/fitness</code>. iPhones only share Health data while unlocked, so the hub keeps each day's highest value.</p>
    <div class="actions"><button type="submit">Save goals</button><span id="fitness-msg" class="muted"></span></div>`;
}

async function loadFitness(): Promise<void> {
  const box = document.getElementById("fitness-body");
  const form = document.getElementById("fitness") as HTMLFormElement | null;
  if (!box || !form) return;
  try {
    const res = await api("/api/admin/fitness");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { people: FitnessPerson[] };
    box.innerHTML = fitnessHtml(body.people);
  } catch (err) {
    if ((err as Error).message === "unauthorized") return;
    box.innerHTML = `<p class="error">Fitness unavailable: ${escapeHtml((err as Error).message)}</p>`;
    return;
  }
  form.onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById("fitness-msg");
    const goals: Record<string, Record<string, number>> = {};
    for (const input of form.querySelectorAll<HTMLInputElement>("input[data-goal]")) {
      const [id, kind] = input.dataset.goal!.split(":");
      (goals[id] ??= {})[kind] = Number(input.value);
    }
    try {
      const res = await api("/api/admin/fitness", { method: "PUT", body: JSON.stringify({ goals }), headers: { "content-type": "application/json" } });
      const body = (await res.json()) as { people?: FitnessPerson[]; error?: string };
      if (!res.ok || !body.people) throw new Error(body.error ?? `HTTP ${res.status}`);
      box.innerHTML = fitnessHtml(body.people);
      const m = document.getElementById("fitness-msg");
      if (m) m.textContent = "Saved. The screens show the new goals from the next check-in.";
    } catch (err) {
      if ((err as Error).message === "unauthorized") return;
      if (msg) {
        msg.textContent = (err as Error).message;
        msg.className = "error";
      }
    }
  };
}

function bindForm(state: AdminState): void {
  const c = draft!;
  document.getElementById("logout")!.addEventListener("click", () => {
    setToken(null);
    renderLogin();
  });
  const form = document.getElementById("config") as HTMLFormElement;
  form.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (el.id === "screen") {
      c.screen = el.value;
    } else if (el.id === "kino-from") {
      c.kino.from = el.value;
    } else if (el.id === "lbx-user") {
      c.kino.letterboxdUser = el.value.trim();
    } else if (el.id === "lbx-hide") {
      c.kino.hideSeen = (el as HTMLInputElement).checked;
    } else if (el.dataset.film) {
      const slug = el.dataset.film;
      const set = new Set(c.kino.hiddenFilms);
      if ((el as HTMLInputElement).checked) set.add(slug);
      else set.delete(slug);
      c.kino.hiddenFilms = [...set];
    } else if (el.id === "interval") {
      c.checkinMinutes = Number(el.value);
    } else if (el.id === "exit") {
      c.exit = (el as HTMLInputElement).checked;
    } else if (el.closest(".cinemas")) {
      c.kino.cinemas = [...form.querySelectorAll<HTMLInputElement>(".cinemas input:checked")].map((x) => x.value);
    }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("save-msg")!;
    msg.className = "muted";
    msg.textContent = "Saving…";
    const res = await api(withDevice("/api/admin/kindle/config"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
    const body = (await res.json()) as { config?: KindleConfig; error?: string };
    if (!res.ok || !body.config) {
      msg.className = "error";
      msg.textContent = body.error ?? `Save failed (${res.status})`;
      return;
    }
    draft = body.config;
    state.config = body.config;
    render(state);
    const after = document.getElementById("save-msg")!;
    after.className = "ok";
    after.textContent = "Saved. Press the Kindle's power button to apply now, or it applies at the next check-in.";
  });
}

async function loadPreview(state: AdminState): Promise<void> {
  const box = document.getElementById("preview");
  if (!box || !previewScreen) return;
  const screen = previewScreen;
  box.innerHTML = `<p class="muted">Rendering ${escapeHtml(state.screens[screen]?.name ?? screen)}…</p>`;
  try {
    const res = await api(withDevice(`/api/admin/kindle/screen?screen=${encodeURIComponent(screen)}`));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
    if (screen !== previewScreen) return; // another tab was picked meanwhile
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(await res.blob());
    box.innerHTML = `<img src="${previewUrl}" alt="${escapeHtml(state.screens[screen]?.name ?? screen)} screen as the Kindle shows it now" width="1448" height="1072">`;
  } catch (err) {
    if ((err as Error).message === "unauthorized") return;
    box.innerHTML = `<p class="error">Preview unavailable: ${escapeHtml((err as Error).message)}</p>`;
  }
}

async function load(): Promise<void> {
  if (!sessionToken) {
    renderLogin();
    return;
  }
  app.innerHTML = `<main><p class="muted">Loading…</p></main>`;
  try {
    const res = await api(withDevice("/api/admin/kindle"));
    if (res.status === 400) {
      // A remembered device that no longer exists: fall back to the first one.
      setDevice("kindle_01");
      return load();
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      app.innerHTML = `<main><p class="error">${escapeHtml(body.error ?? `HTTP ${res.status}`)}</p></main>`;
      return;
    }
    draft = null;
    render((await res.json()) as AdminState);
  } catch (err) {
    if ((err as Error).message !== "unauthorized") {
      app.innerHTML = `<main><p class="error">${escapeHtml((err as Error).message)}</p></main>`;
    }
  }
}

// ------------------------------------------------------------------
// Design (#design)
// ------------------------------------------------------------------

interface DesignInfo {
  rendered: string;
  tokens: {
    grid: { cols: number; rows: number; col: number; row: number; gap: number; margin: number; pad: number; radius: number; firstCap: number; canvas: { w: number; h: number }; note: string };
    sizes: { name: string; cols: number; rows: number; w: number; h: number; modules: string[] }[];
    type: { name: string; size: number; bold: boolean; lead?: number; use: string }[];
    inks: { name: string; hex: string; dark: string; use: string }[];
    extraGrays: { hex: string; use: string }[];
    tileStyles: { name: string; use: string }[];
    components: { name: string; use: string }[];
  };
  specimens: { group: string; title: string; sub: string; h: number }[];
}

let designUrls: string[] = [];

type View = "kindles" | "fotos" | "design";

/** The top-level views: the Kindles (default), the photos and the Design. */
function navHtml(active: View): string {
  const link = (href: string, view: View, label: string) =>
    `<a href="${href}" class="view${active === view ? " active" : ""}"${active === view ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<nav class="views" aria-label="View">${link("#", "kindles", "Kindles")}${link("#fotos", "fotos", "Photos")}${link("#design", "design", "Design")}</nav>`;
}

const table = (head: string[], rows: string[][]) =>
  `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
const swatch = (hex: string) => (hex ? `<span class="sw" style="background:${escapeHtml(hex)}"></span><code>${escapeHtml(hex)}</code>` : "");

function designHtml(d: DesignInfo): string {
  const t = d.tokens;
  const g = t.grid;
  const groups = [...new Set(d.specimens.map((s) => s.group))];
  return `
    <section class="card">
      <h2>Tokens</h2>
      <p class="muted">The tiles as the Kindle draws them: Arimo, the panel's 16 grays, the ${g.canvas.w} × ${g.canvas.h} canvas (the Paperwhite 2 draws it at 71 %). Rendered ${escapeHtml(d.rendered)}.</p>
      <h3>Grid</h3>
      <p class="muted">${escapeHtml(g.note)}</p>
      ${table(["Cells", "Cell", "Gap", "Margin", "Padding", "Radius", "First line"], [[`${g.cols} × ${g.rows}`, `${g.col} × ${g.row}`, `${g.gap}`, `${g.margin}`, `${g.pad}`, `${g.radius}`, `capitals ${g.firstCap} below the top`]])}
      <h3>Sizes</h3>
      ${table(["Size", "Span", "Tile", "Modules"], t.sizes.map((s) => [escapeHtml(s.name), `${s.cols} × ${s.rows}`, `${s.w} × ${s.h}`, escapeHtml(s.modules.join(", "))]))}
      <h3>Type</h3>
      ${table(["Token", "Size", "Weight", "Used for"], t.type.map((x) => [escapeHtml(x.name), `${x.size}${x.lead ? ` / ${x.lead}` : ""}`, x.bold ? "bold" : "regular", escapeHtml(x.use)]))}
      <h3>Inks</h3>
      ${table(["Token", "On paper", "On dark", "Used for"], [
        ...t.inks.map((x) => [escapeHtml(x.name), swatch(x.hex), swatch(x.dark), escapeHtml(x.use)]),
        ...t.extraGrays.map((x) => ["—", swatch(x.hex), "", escapeHtml(x.use)]),
      ])}
      <h3>Tile styles</h3>
      ${table(["Style", "Used for"], t.tileStyles.map((x) => [escapeHtml(x.name), escapeHtml(x.use)]))}
      <h3>Components</h3>
      ${table(["Component", "Used for"], t.components.map((x) => [`<code>${escapeHtml(x.name)}</code>`, escapeHtml(x.use)]))}
    </section>
    ${groups
      .map(
        (group) => `<section class="card">
      <h2>${escapeHtml(group)}</h2>
      ${d.specimens
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.group === group)
        .map(({ s, i }) => `<figure class="specimen">
          <figcaption><strong>${escapeHtml(s.title)}</strong> <span class="muted">${escapeHtml(s.sub)}</span></figcaption>
          <div class="preview" id="specimen-${i}" style="aspect-ratio: 1448 / ${s.h}"><p class="muted">Rendering…</p></div>
        </figure>`)
        .join("")}
    </section>`,
      )
      .join("")}`;
}

/** Load the specimens' images three at a time (each is a render on the renderer). */
async function loadSpecimens(d: DesignInfo): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < d.specimens.length) {
      const i = next++;
      const box = document.getElementById(`specimen-${i}`);
      if (!box) return; // the view changed
      try {
        const res = await api(`/api/admin/design/${i}.png`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const url = URL.createObjectURL(await res.blob());
        designUrls.push(url);
        box.innerHTML = `<img src="${url}" alt="${escapeHtml(d.specimens[i].title)}" width="1448" height="${d.specimens[i].h}">`;
      } catch (err) {
        if ((err as Error).message === "unauthorized") return;
        box.innerHTML = `<p class="error">Unavailable: ${escapeHtml((err as Error).message)}</p>`;
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

async function loadDesign(): Promise<void> {
  if (!sessionToken) {
    renderLogin();
    return;
  }
  for (const u of designUrls) URL.revokeObjectURL(u);
  designUrls = [];
  app.innerHTML = `
    <main>
      <header class="top">
        <h1>Kindle dashboard</h1>
        ${navHtml("design")}
        <button type="button" class="ghost" id="logout">Forget token</button>
      </header>
      <div id="design"><p class="muted">Loading the design…</p></div>
    </main>`;
  document.getElementById("logout")!.addEventListener("click", () => {
    setToken(null);
    renderLogin();
  });
  const box = document.getElementById("design")!;
  try {
    const res = await api("/api/admin/design");
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const d = (await res.json()) as DesignInfo;
    box.innerHTML = designHtml(d);
    void loadSpecimens(d);
  } catch (err) {
    if ((err as Error).message !== "unauthorized") box.innerHTML = `<p class="error">Design unavailable: ${escapeHtml((err as Error).message)}</p>`;
  }
}

// ------------------------------------------------------------------
// Photos (#fotos, Phase 17)
// ------------------------------------------------------------------

interface Photo {
  id: string;
  name: string;
  added: string;
}

/** The Foto tile's pixels on the Paperwhite 3 (a small tile, 1 × 1 on the 3 × 3 grid). */
const PHOTO_W = 468;
const PHOTO_H = 344;

let photoUrls: string[] = [];
let photoSource: HTMLImageElement | null = null;

/**
 * The photo as the Kindle shows it, drawn into `canvas`: cropped to the
 * tile (`fx`/`fy` place the crop, 0–1), grayscale with a little contrast,
 * then Floyd–Steinberg dithered to the panel's 16 grays (multiples of 17),
 * so soft backgrounds don't band.
 */
function preparePhoto(img: HTMLImageElement, canvas: HTMLCanvasElement, fx: number, fy: number): void {
  canvas.width = PHOTO_W;
  canvas.height = PHOTO_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const scale = Math.max(PHOTO_W / img.naturalWidth, PHOTO_H / img.naturalHeight);
  const sw = PHOTO_W / scale, sh = PHOTO_H / scale;
  const sx = (img.naturalWidth - sw) * fx, sy = (img.naturalHeight - sh) * fy;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, PHOTO_W, PHOTO_H);
  const im = ctx.getImageData(0, 0, PHOTO_W, PHOTO_H);
  const d = im.data;
  const px = new Float32Array(PHOTO_W * PHOTO_H);
  for (let i = 0; i < px.length; i++) {
    const y = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
    px[i] = 1.12 * y - 12;
  }
  for (let y = 0; y < PHOTO_H; y++) {
    for (let x = 0; x < PHOTO_W; x++) {
      const i = y * PHOTO_W + x;
      const q = Math.max(0, Math.min(255, Math.round(px[i] / 17) * 17));
      const e = px[i] - q;
      px[i] = q;
      if (x + 1 < PHOTO_W) px[i + 1] += (e * 7) / 16;
      if (y + 1 < PHOTO_H) {
        if (x > 0) px[i + PHOTO_W - 1] += (e * 3) / 16;
        px[i + PHOTO_W] += (e * 5) / 16;
        if (x + 1 < PHOTO_W) px[i + PHOTO_W + 1] += e / 16;
      }
    }
  }
  for (let i = 0; i < px.length; i++) {
    d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = px[i];
    d[4 * i + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
}

function photosHtml(photos: Photo[]): string {
  return `
    <section class="card">
      <h2>Add a photo</h2>
      <p class="muted">Shown in the Foto tile on Matt's screen, one photo a day. It's prepared here as the Kindle will show it: cropped to the tile (${PHOTO_W} × ${PHOTO_H}), grayscale and dithered to the 16 grays.</p>
      <label class="inline">Photo <input type="file" id="photo-file" accept="image/*"></label>
      <div id="photo-edit" hidden>
        <canvas id="photo-canvas" class="photo-preview" width="${PHOTO_W}" height="${PHOTO_H}"></canvas>
        <label class="inline">Crop left–right <input type="range" id="photo-x" min="0" max="100" value="50"></label>
        <label class="inline">Crop top–bottom <input type="range" id="photo-y" min="0" max="100" value="30"></label>
        <button type="button" id="photo-upload">Upload</button>
        <span class="muted" id="photo-status"></span>
      </div>
    </section>
    <section class="card">
      <h2>Photos <span class="muted">(${photos.length})</span></h2>
      ${photos.length ? `<ul class="photos">${photos
        .map((p) => `<li><div class="photo-thumb" id="thumb-${escapeHtml(p.id)}"></div>
          <span>${escapeHtml(p.name || "Photo")}</span> <span class="muted">${escapeHtml(berlinTime(p.added))}</span>
          <button type="button" class="ghost" data-delete="${escapeHtml(p.id)}">Delete</button></li>`)
        .join("")}</ul>` : `<p class="muted">No photos yet: the tile shows its placeholder.</p>`}
    </section>`;
}

async function loadFotos(): Promise<void> {
  if (!sessionToken) {
    renderLogin();
    return;
  }
  for (const u of photoUrls) URL.revokeObjectURL(u);
  photoUrls = [];
  photoSource = null;
  app.innerHTML = `
    <main>
      <header class="top">
        <h1>Kindle dashboard</h1>
        ${navHtml("fotos")}
        <button type="button" class="ghost" id="logout">Forget token</button>
      </header>
      <div id="fotos"><p class="muted">Loading the photos…</p></div>
    </main>`;
  document.getElementById("logout")!.addEventListener("click", () => {
    setToken(null);
    renderLogin();
  });
  const box = document.getElementById("fotos")!;
  let photos: Photo[];
  try {
    const res = await api("/api/admin/photos");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    photos = (await res.json()) as Photo[];
  } catch (err) {
    if ((err as Error).message !== "unauthorized") box.innerHTML = `<p class="error">Photos unavailable: ${escapeHtml((err as Error).message)}</p>`;
    return;
  }
  box.innerHTML = photosHtml(photos);

  // Adding: pick a file, adjust the crop, upload the prepared PNG.
  const file = document.getElementById("photo-file") as HTMLInputElement;
  const canvas = document.getElementById("photo-canvas") as HTMLCanvasElement;
  const sx = document.getElementById("photo-x") as HTMLInputElement;
  const sy = document.getElementById("photo-y") as HTMLInputElement;
  const status = document.getElementById("photo-status")!;
  const redraw = () => {
    if (photoSource) preparePhoto(photoSource, canvas, Number(sx.value) / 100, Number(sy.value) / 100);
  };
  file.addEventListener("change", () => {
    const f = file.files?.[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      photoSource = img;
      document.getElementById("photo-edit")!.hidden = false;
      redraw();
    };
    img.onerror = () => (status.textContent = "That file couldn't be read as an image.");
    img.src = URL.createObjectURL(f);
  });
  sx.addEventListener("input", redraw);
  sy.addEventListener("input", redraw);
  document.getElementById("photo-upload")!.addEventListener("click", async () => {
    if (!photoSource) return;
    status.textContent = "Uploading…";
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) {
      status.textContent = "Couldn't prepare the photo.";
      return;
    }
    try {
      const name = (file.files?.[0]?.name ?? "").replace(/\.[^.]+$/, "");
      const res = await api(`/api/admin/photos?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "content-type": "image/png" }, body: blob });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
      void loadFotos();
    } catch (err) {
      if ((err as Error).message !== "unauthorized") status.textContent = `Upload failed: ${(err as Error).message}`;
    }
  });

  // The list: thumbnails (they need the auth header) and delete buttons.
  for (const p of photos) {
    void api(`/api/admin/photos/${p.id}.png`).then(async (res) => {
      const el = document.getElementById(`thumb-${p.id}`);
      if (!res.ok || !el) return;
      const url = URL.createObjectURL(await res.blob());
      photoUrls.push(url);
      el.innerHTML = `<img src="${url}" alt="${escapeHtml(p.name || "Photo")}" width="${PHOTO_W}" height="${PHOTO_H}">`;
    }).catch(() => {});
  }
  for (const btn of box.querySelectorAll<HTMLButtonElement>("[data-delete]")) {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this photo?")) return;
      try {
        await api(`/api/admin/photos/${btn.dataset.delete}`, { method: "DELETE" });
        void loadFotos();
      } catch {
        // unauthorized is handled by api()
      }
    });
  }
}

/** Show the view the URL names. */
function route(): void {
  if (location.hash === "#design") void loadDesign();
  else if (location.hash === "#fotos") void loadFotos();
  else void load();
}

window.addEventListener("hashchange", route);
route();
