// ============================================================
// Calendar Source — Google Calendar API + iCal fallback (Phase 3)
// Fetches events for the device using the
// GOOGLE_CALENDAR_ACCESS_TOKEN secret, or an iCal URL
// configured on the device (e.g. Google Calendar's private
// address in iCal format).
// ============================================================

import type { AppEnv, CalendarEvent, DeviceConfig } from "../types";
import { readCached } from "./cached";

export async function fetchEvents(device: DeviceConfig, env: AppEnv): Promise<CalendarEvent[]> {
  if (env.GOOGLE_CALENDAR_ACCESS_TOKEN) {
    return fetchGoogleEvents(device, env);
  }
  if (device.calendarIcsUrl) {
    const res = await fetch(device.calendarIcsUrl);
    if (!res.ok) throw new Error(`Calendar iCal URL returned ${res.status}`);
    return parseICal(await res.text());
  }
  return [];
}

async function fetchGoogleEvents(device: DeviceConfig, env: AppEnv): Promise<CalendarEvent[]> {
  const calendarId = device.calendarId ?? "primary";
  const token = env.GOOGLE_CALENDAR_ACCESS_TOKEN!;
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const params = new URLSearchParams({
    timeMin: new Date(Date.now() - 7 * 86400000).toISOString(),
    timeMax: new Date(Date.now() + 86400000).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "10",
    showDeleted: "false",
  });

  const events: CalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`${url}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Google Calendar returned ${res.status}`);
    const json = (await res.json()) as { items?: unknown[]; nextPageToken?: string };
    for (const item of json.items ?? []) events.push(parseCalendarEvent(item));
    pageToken = json.nextPageToken;
  } while (pageToken);
  return events.sort((a, b) => a.startIso.localeCompare(b.startIso));
}

/** Parse a Google Calendar API event resource. */
export function parseCalendarEvent(item: unknown): CalendarEvent {
  const o = item as {
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  };
  const start = o.start?.dateTime ?? o.start?.date ?? "";
  return {
    title: o.summary ?? o.description ?? "(Untitled event)",
    start: formatClockOrDate(start),
    startIso: start,
    allDay: o.start?.date !== undefined,
    end: o.end?.dateTime ?? o.end?.date,
    location: o.location,
    description: o.description,
  };
}

/** Parse an iCalendar (ICS) feed into calendar events. */
export function parseICal(ics: string): CalendarEvent[] {
  // Unfold continuation lines (CRLF/LF followed by a space or tab).
  const lines: string[] = [];
  for (const raw of ics.split(/\r?\n/)) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }

  const events: CalendarEvent[] = [];
  let title = "";
  let start = "";
  let end = "";
  let inEvent = false;
  const flush = () => {
    if (inEvent && title) {
      events.push({
        title,
        start: formatClockOrDate(start),
        startIso: start,
        allDay: !start.includes("T"),
        end: end || undefined,
      });
    }
    title = "";
    start = "";
    end = "";
  };

  for (const line of lines) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).split(";")[0].trim().toUpperCase();
    const value = line.slice(colon + 1);
    if (key === "BEGIN" && value.trim().toUpperCase() === "VEVENT") {
      flush();
      inEvent = true;
      continue;
    }
    if (key === "END" && value.trim().toUpperCase() === "VEVENT") {
      flush();
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;
    if (key === "SUMMARY") title = value;
    else if (key === "DTSTART") start = value;
    else if (key === "DTEND") end = value;
  }
  flush();
  return events.sort((a, b) => a.startIso.localeCompare(b.startIso));
}

/** Format an ISO timestamp for display (clock for datetimes, date otherwise). */
export function formatClockOrDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (iso.includes("T")) {
    return d.toLocaleTimeString("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export async function getCachedEvents(env: AppEnv, device: DeviceConfig): Promise<CalendarEvent[]> {
  return (await readCached<CalendarEvent[]>(env, device, "cachedEvents")) ?? [];
}
