// Thin fetch wrappers for the two backends.
import { API, NAV } from "./config.js";

async function call(base, path, method = "GET", body) {
  const r = await fetch(base + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

export const api = {
  status: () => call(API, "/api/ai/status"),
  list: () => call(API, "/api/assignments"),
  create: (a) => call(API, "/api/assignments", "POST", a),
  update: (id, patch) => call(API, `/api/assignments/${id}`, "PATCH", patch),
  remove: (id) => call(API, `/api/assignments/${id}`, "DELETE"),
  quickAdd: (text) => call(API, "/api/ai/quick-add", "POST", { text }),
  breakdown: (id) => call(API, `/api/assignments/${id}/breakdown`, "POST", {}),
  plan: () => call(API, "/api/ai/plan", "POST", {}),
  myday: (from) => call(API, `/api/myday${from ? "?from=" + encodeURIComponent(from) : ""}`),
  progress: () => call(API, "/api/progress"),
  timetable: () => call(API, "/api/timetable"),
  saveTimetable: (entries) => call(API, "/api/timetable", "PUT", { entries }),
};

export const nav = {
  campus: () => call(NAV, "/api/campus"),
  health: () => call(NAV, "/api/health"),
};
