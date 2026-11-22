// ============================================================
// Dashboard Drawing (Phase 3)
// drawDashboard renders a device's layout onto a bitmap canvas
// from aggregated DashboardData, using the pure-JS bitmap engine:
// a header (name, clock, date), per-layout widgets (calendar,
// weather, tasks) with rows of text, and a footer.
// ============================================================

import type { CalendarEvent, DashboardData, DeviceConfig, ForecastDay, Task, WeatherData } from "../types";
import { Bitmap, drawCircleStroke, drawLine, drawRect, drawText, drawTriangle, textWidth } from "./bitmap";
import { parseIcsDate } from "../data/calendar";

const MARGIN = 16;
const FRAME = 3;

interface WidgetBox {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  rows: string[];
  warning?: boolean;
  icon?: string;
}

export function drawDashboard(bm: Bitmap, device: DeviceConfig, data: DashboardData): void {
  const W = device.width;
  const H = device.height;
  const boxes = widgetBoxes(device, data);

  // Frame + header
  drawRect(bm, MARGIN, MARGIN, W - 32, H - 32, FRAME);
  drawText(bm, device.name, MARGIN + 26, MARGIN + 10, 24);

  // Clock — centered
  const clock = clockTime();
  drawText(bm, clock, W / 2 - textWidth(clock, 36) / 2, Math.floor(H * 0.30) - 18, 36);

  // Date — centered below the clock
  const date = clockDate();
  drawText(bm, date, W / 2 - textWidth(date, 22) / 2, Math.floor(H * 0.30) + 6, 22);

  // Layout label — centered below the date
  const label = layoutLabel(device);
  drawText(bm, label, W / 2 - textWidth(label, 18) / 2, Math.floor(H * 0.56), 18);

  // Widgets
  for (const box of boxes) drawWidget(bm, box);

  // Footer
  drawLine(bm, 40, H - 60, W - 40, H - 60, 2);
  const footer = `bildergram · ${device.id} · ${clock}`;
  drawText(bm, footer, W / 2 - textWidth(footer, 14) / 2, H - 30, 14);
}

function drawWidget(bm: Bitmap, box: WidgetBox): void {
  drawRect(bm, box.x, box.y, box.w, box.h, 3);

  // Label (+ weather condition icon when present)
  drawText(bm, box.label, box.x + 26, box.y + 26, 20);
  if (box.icon) drawWeatherIcon(bm, box.icon, box.x + 8, box.y + 26);

  // Subtle warning marker when fresh data is unavailable
  if (box.warning) {
    drawTriangle(bm, box.x + box.w - 12, box.y + 14, box.x + box.w - 6, box.y + 8, box.x + box.w - 6, box.y + 20);
  }

  // Rows
  let rowY = box.y + 56;
  for (const row of box.rows) {
    drawText(bm, row, box.x + 26, rowY, 18);
    rowY += 30;
  }
}

// ------------------------------------------------------------------
// Widget layout
// ------------------------------------------------------------------

function widgetBoxes(device: DeviceConfig, data: DashboardData): WidgetBox[] {
  const boxes: WidgetBox[] = [];
  let y = Math.floor(device.height * 0.16);

  const hasCalendar = !!(device.calendarId || device.calendarIcsUrl);
  const hasWeather = device.layout === "household-overview" && !!device.weatherCity;
  const hasTasks = device.layout === "productivity" && !!device.tasksEnabled;

  const add = (label: string, rows: string[], warning?: boolean, icon?: string) => {
    boxes.push({ x: MARGIN, y, w: device.width - 32, h: 56 + rows.length * 30, label, rows, warning, icon });
    y += 56 + rows.length * 30 + 16;
  };

  if (hasCalendar) add("Calendar", calendarRows(device, data), data.errors.calendar);
  if (hasWeather) add("Weather", weatherRows(device, data), data.errors.weather, data.weather?.iconName);
  if (hasTasks) add("Tasks", taskRows(device, data), data.errors.tasks);

  return boxes;
}

// ------------------------------------------------------------------
// Widget content
// ------------------------------------------------------------------

function calendarRows(device: DeviceConfig, data: DashboardData): string[] {
  // Show only upcoming events — feeds include past entries. Unparseable
  // timestamps are kept (assume upcoming).
  const events = (data.events ?? []).filter((e) => {
    const d = parseIcsDate(e.startIso);
    return d === null || d.getTime() >= Date.now() - 60_000;
  });
  const max = device.maxCalendarEvents ?? 4;
  if (events.length > 0) {
    return events.slice(0, max).map((e) => truncate(eventLine(e), 100));
  }
  return [data.errors.calendar ? "No events — last update had an error" : "No events today"];
}

function eventLine(e: CalendarEvent): string {
  const when = e.allDay ? "All day" : e.start;
  let line = `${when}: ${e.title}`;
  if (e.location) line += ` — ${e.location}`;
  return line;
}

function weatherRows(device: DeviceConfig, data: DashboardData): string[] {
  const rows: string[] = [];
  const w = data.weather;
  if (w) {
    rows.push(`Today · ${w.temp}° · ${w.condition} · Wind ${w.windSpeed} m/s`);
    for (const day of data.forecast ?? []) {
      rows.push(`${day.date} · ${day.high}°/${day.low}° · ${day.condition}`);
    }
  }
  if (rows.length === 0) rows.push("No weather data yet");
  return rows.map((r) => truncate(r, 100));
}

function taskRows(device: DeviceConfig, data: DashboardData): string[] {
  const tasks = data.tasks ?? [];
  const max = device.maxTasks ?? 5;
  if (tasks.length > 0) {
    return tasks.slice(0, max).map((t) => truncate(taskLine(t), 100));
  }
  return ["No open tasks"];
}

function taskLine(t: Task): string {
  const priority = t.priority >= 4 ? "P4" : t.priority >= 3 ? "P3" : t.priority >= 2 ? "P2" : "P1";
  return `[${priority}] ${t.content}`;
}

// ------------------------------------------------------------------
// Weather condition icons (small vector shapes near the widget label)
// ------------------------------------------------------------------

function drawWeatherIcon(bm: Bitmap, icon: string, cx: number, cy: number): void {
  switch (icon) {
    case "sunny":
      drawCircleStroke(bm, cx, cy, 11, 3);
      for (const [dx, dy] of [[0, -13], [0, 13], [-13, 0], [13, 0]]) {
        drawLine(bm, cx, cy, cx + dx, cy + dy, 3);
      }
      break;
    case "partly-cloudy":
      drawCircleStroke(bm, cx - 3, cy + 2, 9, 3);
      bm.fillBlock(cx + 4, cy - 8, 10, 10);
      break;
    case "cloudy":
      drawCircleStroke(bm, cx - 4, cy + 2, 10, 3);
      drawCircleStroke(bm, cx + 6, cy, 16, 3);
      break;
    case "rain":
      drawCircleStroke(bm, cx - 3, cy + 2, 10, 3);
      drawCircleStroke(bm, cx + 7, cy - 4, 7, 3);
      drawLine(bm, cx - 4, cy + 14, cx - 4, cy + 20, 3);
      drawLine(bm, cx + 4, cy + 14, cx + 4, cy + 20, 3);
      break;
    case "storm":
      drawCircleStroke(bm, cx - 2, cy + 2, 10, 3);
      drawCircleStroke(bm, cx + 8, cy - 4, 7, 3);
      drawLine(bm, cx - 10, cy + 14, cx, cy - 8, 3);
      drawLine(bm, cx, cy - 8, cx + 2, cy - 8, 3);
      drawLine(bm, cx - 2, cy + 12, cx + 2, cy + 12, 3);
      break;
    case "snow":
      drawCircleStroke(bm, cx - 4, cy + 2, 10, 3);
      drawCircleStroke(bm, cx + 6, cy - 2, 13, 3);
      break;
    default:
      drawCircleStroke(bm, cx, cy, 12, 3);
  }
}

// ------------------------------------------------------------------
// Text helpers
// ------------------------------------------------------------------

function clockTime(): string {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
}

function clockDate(): string {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });
}

function layoutLabel(device: DeviceConfig): string {
  return `Layout: ${device.layout} · ${device.orientation} · ${device.width}×${device.height}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
