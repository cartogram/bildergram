// ============================================================
// Admin SPA — Kindle dashboards (Phase 9–10)
// For each Kindle: shows its last check-in and battery history, edits
// its screen schedule, check-in interval and cinemas, and previews each
// screen at its size. Talks to /api/admin/kindle* with the admin token (asked for
// once and kept in this browser's localStorage).
// ============================================================

import "./styles.css";

interface ScreenInfo {
  name: string;
  shows: string;
}

interface KindleConfig {
  schedule: { at: string; screen: string }[];
  kino: { cinemas: string[]; from: string };
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

/** The screen the schedule shows right now (Berlin time). */
function currentScreen(c: KindleConfig): string {
  const hhmm = new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
  const sorted = [...c.schedule].sort((a, b) => a.at.localeCompare(b.at));
  let current = sorted[sorted.length - 1];
  for (const e of sorted) if (e.at <= hhmm) current = e;
  return current.screen;
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
    void load();
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

function scheduleHtml(c: KindleConfig, screens: Record<string, ScreenInfo>): string {
  const rows = c.schedule
    .map(
      (e, i) => `
      <li class="slot">
        <input type="time" value="${e.at}" data-i="${i}" data-field="at" aria-label="From">
        <select data-i="${i}" data-field="screen" aria-label="Screen">
          ${Object.entries(screens).map(([id, s]) => `<option value="${id}" ${id === e.screen ? "selected" : ""}>${escapeHtml(s.name)} — ${escapeHtml(s.shows)}</option>`).join("")}
        </select>
        <button type="button" class="ghost" data-remove="${i}" ${c.schedule.length === 1 ? "disabled" : ""} aria-label="Remove">✕</button>
      </li>`,
    )
    .join("");
  return `<ol class="slots">${rows}</ol>
    <button type="button" class="ghost" id="add-slot">+ Add a switch</button>
    <p class="muted">Each screen shows from its time until the next one; the last runs past midnight.</p>
    <label class="inline">Check in every <input type="number" id="interval" min="15" max="360" step="15" value="${c.checkinMinutes}"> minutes while a weather screen is showing</label>`;
}

function cinemasHtml(c: KindleConfig, cinemas: Record<string, string>): string {
  return `<div class="cinemas">${Object.entries(cinemas)
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(
      ([slug, name]) => `<label class="check"><input type="checkbox" value="${slug}" ${c.kino.cinemas.includes(slug) ? "checked" : ""}> ${escapeHtml(name)}</label>`,
    )
    .join("")}</div>
    <label class="inline">List screenings from <input type="time" id="kino-from" value="${c.kino.from}"></label>`;
}

function render(state: AdminState): void {
  draft ??= structuredClone(state.config);
  const c = draft;
  previewScreen ??= currentScreen(state.config);
  app.innerHTML = `
    <main>
      <header class="top">
        <h1>Kindle dashboard</h1>
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
        <h2>Schedule</h2>
        ${scheduleHtml(c, state.screens)}

        <h2>Cinemas</h2>
        ${cinemasHtml(c, state.cinemas)}

        <h2>Kindle UI</h2>
        <label class="check"><input type="checkbox" id="exit" ${c.exit ? "checked" : ""}> Return to the normal Kindle UI at the next check-in</label>

        <div class="actions">
          <button type="submit">Save</button>
          <span id="save-msg" class="muted">Changes reach the Kindle at its next check-in. Press its power button to apply them now.</span>
        </div>
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
    const i = el.dataset.i;
    if (i !== undefined) {
      const entry = c.schedule[Number(i)];
      if (el.dataset.field === "at") entry.at = el.value;
      if (el.dataset.field === "screen") entry.screen = el.value;
    } else if (el.id === "kino-from") {
      c.kino.from = el.value;
    } else if (el.id === "interval") {
      c.checkinMinutes = Number(el.value);
    } else if (el.id === "exit") {
      c.exit = (el as HTMLInputElement).checked;
    } else if (el.closest(".cinemas")) {
      c.kino.cinemas = [...form.querySelectorAll<HTMLInputElement>(".cinemas input:checked")].map((x) => x.value);
    }
  });
  form.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.dataset.remove !== undefined) {
      c.schedule.splice(Number(t.dataset.remove), 1);
      render(state);
    } else if (t.id === "add-slot") {
      c.schedule.push({ at: "12:00", screen: "tag" });
      render(state);
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

void load();
