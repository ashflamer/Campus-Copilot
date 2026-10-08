// Thin fetch wrappers for the two backends.
// If a direct backend URL can't be reached (e.g. hosted preview where only the UI port
// is exposed), each call retries once through serve.py's same-origin proxy and then
// keeps using the proxy for the rest of the session.
import { API, NAV, PROXY_API, PROXY_NAV } from "./config.js";

const base = { api: API, nav: NAV };
const proxy = { api: PROXY_API, nav: PROXY_NAV };

async function call(which, path, method = "GET", body) {
  const opts = {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  };
  let r;
  try {
    r = await fetch(base[which] + path, opts);
  } catch (e) {
    if (base[which] === proxy[which]) throw e;          // already on the proxy: real failure
    r = await fetch(proxy[which] + path, opts);          // network/CORS error: try same-origin proxy
    base[which] = proxy[which];
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

export const navBase = () => base.nav;

export const api = {
  status: () => call("api", "/api/ai/status"),
  list: () => call("api", "/api/assignments"),
  create: (a) => call("api", "/api/assignments", "POST", a),
  update: (id, patch) => call("api", `/api/assignments/${id}`, "PATCH", patch),
  remove: (id) => call("api", `/api/assignments/${id}`, "DELETE"),
  quickAdd: (text) => call("api", "/api/ai/quick-add", "POST", { text }),
  breakdown: (id) => call("api", `/api/assignments/${id}/breakdown`, "POST", {}),
  plan: () => call("api", "/api/ai/plan", "POST", {}),
  myday: (from) => call("api", `/api/myday${from ? "?from=" + encodeURIComponent(from) : ""}`),
  progress: () => call("api", "/api/progress"),
  timetable: () => call("api", "/api/timetable"),
  saveTimetable: (entries) => call("api", "/api/timetable", "PUT", { entries }),
};

export const nav = {
  campus: () => call("nav", "/api/campus"),
  health: () => call("nav", "/api/health"),
  // Next class from the student's own timetable entries (navigator POST integration).
  nextClass: (entries, from) => call("nav", "/api/next-class", "POST", { entries, from }),
  route: (from, to) => call("nav", `/api/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
};
