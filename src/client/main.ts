// ============================================================
// Admin SPA — Kindle dashboard (Phase 7)
// Shows the Kindle's last check-in, edits its screen schedule and
// cinema choice, and previews the Yorck listing. Talks to
// /api/admin/kindle* with the admin token (asked for once and kept
// in this browser's localStorage).
// ============================================================

import "./styles.css";

type Screen = "tempelhof" | "kino";

interface KindleConfig {
  schedule: { at: string; screen: Screen }[];
  kino: { cinemas: string[]; from: string };
  exit: boolean;
}

interface KindleStatus {
  checkedInAt: string;
  reason: string;
  battery: number | null;
  charging: boolean;
  screen: string;
  version: string;
  have: string[];
  log: string;
}

interface AdminState {
  config: KindleConfig;
  status: KindleStatus | null;
  cinemas: Record<string, string>;
}

const SCREEN_LABELS: Record<Screen, string> = {
  tempelhof: "Tempelhof Field (updates every minute)",
  kino: "Yorck listing (that evening's screenings)",
};

const TOKEN_KEY = "bildergram-admin-token";
const app = document.getElementById("app")!;
let draft: KindleConfig | null = null;
let previewUrl: string | null = null;

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

function berlinToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
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

function statusHtml(s: KindleStatus | null): string {
  if (!s) {
    return `<p class="muted">No check-in yet. The Kindle checks in when it needs new cinema listings
      (at 06:00) or when you press its power button.</p>`;
  }
  const today = berlinToday();
  const upcoming = s.have.filter((d) => d >= today);
  return `
    <dl class="facts">
      <div><dt>Last check-in</dt><dd>${escapeHtml(ago(s.checkedInAt))} <span class="muted">(${escapeHtml(berlinTime(s.checkedInAt))}, ${escapeHtml(s.reason || "?")})</span></dd></div>
      <div><dt>Battery</dt><dd>${s.battery ?? "?"}%${s.charging ? " · charging" : ""}</dd></div>
      <div><dt>Screen</dt><dd>${escapeHtml(s.screen || "?")}</dd></div>
      <div><dt>Listings on device</dt><dd>${upcoming.length ? escapeHtml(upcoming.join(", ")) : "none for today or later"}</dd></div>
      <div><dt>Version</dt><dd><code>${escapeHtml(s.version || "?")}</code></dd></div>
    </dl>
    <details><summary>Recent log (UTC)</summary><pre>${escapeHtml(s.log || "(empty)")}</pre></details>`;
}

function scheduleHtml(c: KindleConfig): string {
  const rows = c.schedule
    .map(
      (e, i) => `
      <li class="slot">
        <input type="time" value="${e.at}" data-i="${i}" data-field="at" aria-label="From">
        <select data-i="${i}" data-field="screen" aria-label="Screen">
          ${(Object.keys(SCREEN_LABELS) as Screen[]).map((s) => `<option value="${s}" ${s === e.screen ? "selected" : ""}>${SCREEN_LABELS[s]}</option>`).join("")}
        </select>
        <button type="button" class="ghost" data-remove="${i}" ${c.schedule.length === 1 ? "disabled" : ""} aria-label="Remove">✕</button>
      </li>`,
    )
    .join("");
  return `<ol class="slots">${rows}</ol>
    <button type="button" class="ghost" id="add-slot">+ Add a switch</button>
    <p class="muted">Each screen shows from its time until the next one; the last runs past midnight.</p>`;
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
  app.innerHTML = `
    <main>
      <header class="top">
        <h1>Kindle dashboard</h1>
        <button type="button" class="ghost" id="logout">Forget token</button>
      </header>

      <section class="card">
        <h2>Status</h2>
        ${statusHtml(state.status)}
      </section>

      <form class="card" id="config">
        <h2>Schedule</h2>
        ${scheduleHtml(c)}

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
        <div class="row"><h2>Cinema listing preview</h2><span id="preview-label" class="muted"></span></div>
        <div id="preview" class="preview"><p class="muted">Loading…</p></div>
      </section>
    </main>`;

  bindForm(state);
  void loadPreview();
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
      if (el.dataset.field === "screen") entry.screen = el.value as Screen;
    } else if (el.id === "kino-from") {
      c.kino.from = el.value;
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
      c.schedule.push({ at: "12:00", screen: "tempelhof" });
      render(state);
    }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("save-msg")!;
    msg.className = "muted";
    msg.textContent = "Saving…";
    const res = await api("/api/admin/kindle/config", {
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

async function loadPreview(): Promise<void> {
  const box = document.getElementById("preview");
  const label = document.getElementById("preview-label");
  if (!box || !label) return;
  try {
    const res = await api("/api/admin/kindle/kino");
    const body = (await res.json()) as { days?: string[]; error?: string };
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    const today = berlinToday();
    const day = (body.days ?? []).find((d) => d >= today);
    if (!day) {
      box.innerHTML = `<p class="muted">Yorck hasn't published listings for today or later yet.</p>`;
      return;
    }
    label.textContent = `${day} · published: ${(body.days ?? []).join(", ")}`;
    const img = await api(`/api/admin/kindle/kino?date=${day}`);
    if (!img.ok) throw new Error(`preview HTTP ${img.status}`);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(await img.blob());
    box.innerHTML = `<img src="${previewUrl}" alt="Yorck listing for ${day} as the Kindle shows it" width="1448" height="1072">`;
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
    const res = await api("/api/admin/kindle");
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
