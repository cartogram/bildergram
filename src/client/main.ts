// ============================================================
// Admin SPA — Entry Point
// Vanilla TypeScript dashboard for previewing rendered images,
// checking device health, and triggering manual renders.
// ============================================================

import "./styles.css";

interface DeviceStatus {
  id: string;
  name: string;
  macAddress: string;
  width: number;
  height: number;
  orientation: string;
  refreshRate: number;
  layout: string;
  r2Key: string;
  hasImage: boolean;
  lastRenderedAt: number | null;
  fileSize: number | null;
  hadErrors: boolean;
  renderCount: number | null;
  lastOutcome: string | null;
  lastError: string | null;
}

const app = document.getElementById("app")!;

/** Refresh timer (cleared/restarted on each render). */
let refreshTimer: ReturnType<typeof setInterval> | null = null;

function formatTimestamp(ts: number | null): string {
  if (!ts) return "Never";
  const d = new Date(ts * 1000);
  return d.toLocaleString("en-GB", { timeZone: "Europe/Berlin" });
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const seconds = Math.floor(Date.now() / 1000) - ts;
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** Escape HTML special characters so dynamic values can't inject markup. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchDevices(): Promise<DeviceStatus[]> {
  const res = await fetch("/api/admin/devices");
  const data = await res.json();
  return data.devices;
}

async function triggerRender(deviceId?: string): Promise<void> {
  const url = deviceId
    ? `/api/admin/render/${deviceId}`
    : "/api/admin/render";
  await fetch(url, { method: "POST" });
}

function renderApp(devices: DeviceStatus[]): void {
  app.innerHTML = `
    <header class="header">
      <h1>🖼 bildergram</h1>
      <p class="subtitle">Home Dashboard Server — TRMNL BYOS Admin</p>
      <div class="actions">
        <button id="btn-render-all" class="btn btn-primary">⟳ Force Re-render All</button>
        <button id="btn-refresh" class="btn btn-secondary">↻ Refresh Status</button>
      </div>
    </header>

    <main class="device-grid">
      ${devices.map((d) => renderDeviceCard(d)).join("")}
    </main>

    <footer class="footer">
      <p>bildergram · Phase 1 · Cloudflare Workers + R2 + Vite</p>
    </footer>
  `;

  // Wire up buttons
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => { init(); }, 30_000);
  document.getElementById("btn-render-all")!.addEventListener("click", async () => {
    const btn = document.getElementById("btn-render-all") as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = "⏳ Rendering…";
    await triggerRender();
    setTimeout(() => init(), 3000); // refresh after a delay
  });

  document.getElementById("btn-refresh")!.addEventListener("click", () => init());

  // Per-device render buttons
  devices.forEach((d) => {
    const btn = document.getElementById(`btn-render-${d.id}`);
    btn?.addEventListener("click", async () => {
      (btn as HTMLButtonElement).disabled = true;
      btn.textContent = "⏳ …";
      await triggerRender(d.id);
      setTimeout(() => init(), 3000);
    });
  });
}

function renderDeviceCard(d: DeviceStatus): string {
  const statusClass = d.hasImage ? (d.hadErrors ? "status-warn" : "status-ok") : "status-none";
  const statusLabel = d.hasImage ? (d.hadErrors ? "⚠ Stale (errors)" : "✓ Active") : "○ No image";

  // Phase 4 health diagnostics line
  const healthParts: string[] = [];
  if (d.renderCount != null) healthParts.push(`Renders: ${d.renderCount}`);
  healthParts.push(`Outcome: ${d.lastOutcome ?? "—"}`);
  if (d.lastError) healthParts.push(`⚠ ${d.lastError}`);
  const healthText = healthParts.join(" · ");

  const imgSrc = d.hasImage
    ? `/media/${escapeHtml(d.r2Key.split("/").pop() ?? "")}?v=${d.lastRenderedAt ?? Date.now()}`
    : "";

  return `
    <article class="device-card">
      <div class="device-header">
        <h2>${escapeHtml(d.name)}</h2>
        <span class="status-badge ${statusClass}">${statusLabel}</span>
      </div>
      <p class="health">${healthText}</p>

      <div class="device-preview">
        ${d.hasImage
          ? `<img src="${imgSrc}" alt="${escapeHtml(d.name)} preview"
               class="preview-img ${escapeHtml(d.orientation)}" loading="lazy" />`
          : `<div class="preview-placeholder">No image rendered yet</div>`
        }
      </div>

      <table class="device-meta">
        <tr><th>Device ID</th><td><code>${escapeHtml(d.id)}</code></td></tr>
        <tr><th>MAC Address</th><td><code>${escapeHtml(d.macAddress)}</code></td></tr>
        <tr><th>Resolution</th><td>${d.width} × ${d.height} px (${escapeHtml(d.orientation)})</td></tr>
        <tr><th>Refresh Rate</th><td>${d.refreshRate}s (${d.refreshRate / 60} min)</td></tr>
        <tr><th>Layout</th><td>${escapeHtml(d.layout)}</td></tr>
        <tr><th>Last Rendered</th><td>${formatTimestamp(d.lastRenderedAt)} <small>${timeAgo(d.lastRenderedAt)}</small></td></tr>
        <tr><th>File Size</th><td>${formatBytes(d.fileSize)}</td></tr>
      </table>

      <div class="device-actions">
        <button id="btn-render-${d.id}" class="btn btn-small">⟳ Re-render</button>
      </div>
    </article>
  `;
}

async function init(): Promise<void> {
  try {
    const devices = await fetchDevices();
    renderApp(devices);
  } catch (err) {
    app.innerHTML = `
      <div class="error">
        <h2>⚠ Connection Error</h2>
        <p>Could not reach the bildergram API. Make sure the Worker is running.</p>
        <pre>${err}</pre>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>
    `;
  }
}

init();
