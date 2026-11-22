// ============================================================
// Tasks Source — Todoist API (Phase 3)
// Fetches open tasks via the TODOIST_API_KEY Worker secret.
// ============================================================

import type { AppEnv, DeviceConfig, Task } from "../types";
import { readCached } from "./cached";

const TODOIST_TASKS_URL = "https://api.todoist.com/api/v1/tasks";

export async function fetchTasks(device: DeviceConfig, env: AppEnv): Promise<Task[]> {
  if (!env.TODOIST_API_KEY) return [];
  const res = await fetch(`${TODOIST_TASKS_URL}?limit=100`, {
    headers: { Authorization: `Bearer ${env.TODOIST_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Todoist returned ${res.status}`);
  return parseTasks(await res.json());
}

interface TodoistTask {
  content?: string;
  description?: string;
  priority?: number;
  due?: { datetime?: string; date?: string } | null;
}

export function parseTasks(json: unknown): Task[] {
  return extractTasks(json)
    .map((t) => ({
      content: t.content ?? t.description ?? "(Untitled task)",
      priority: Number(t.priority ?? 1) || 1,
      due: t.due?.datetime ?? t.due?.date,
    }))
    .sort(
      (a, b) => b.priority - a.priority || String(a.due ?? "").localeCompare(String(b.due ?? "")),
    );
}

function extractTasks(json: unknown): TodoistTask[] {
  if (Array.isArray(json)) return json as TodoistTask[];
  if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    for (const key of ["results", "tasks", "items"]) {
      if (Array.isArray(o[key])) return o[key] as TodoistTask[];
    }
  }
  return [];
}

export async function getCachedTasks(env: AppEnv, device: DeviceConfig): Promise<Task[]> {
  return (await readCached<Task[]>(env, device, "cachedTasks")) ?? [];
}
