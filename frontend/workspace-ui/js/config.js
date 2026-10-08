// Where the two backends live.
//
// - On localhost / a LAN IP (normal demo): talk to the backends directly on :8766 and :8765.
// - On any other host (hosted preview, tunnel, single-port deploy): use the same-origin
//   proxy that serve.py provides at /svc/api and /svc/nav.
// - api.js also falls back to the proxy automatically if the direct URL can't be reached.
//
// Override without editing code:
//   http://localhost:5173/?api=http://192.168.1.20:8766&nav=http://192.168.1.20:8765
const q = new URLSearchParams(location.search);
const host = location.hostname || "localhost";
const isLocal = host === "localhost" || host === "127.0.0.1" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);

export const PROXY_API = `${location.origin}/svc/api`;
export const PROXY_NAV = `${location.origin}/svc/nav`;

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const clean = (u) => u.replace(/\/$/, "");

export const API = clean(q.get("api") || read("cs:api") || (isLocal ? `http://${host}:8766` : PROXY_API));
export const NAV = clean(q.get("nav") || read("cs:nav") || (isLocal ? `http://${host}:8765` : PROXY_NAV));
try {
  if (q.get("api")) localStorage.setItem("cs:api", API);
  if (q.get("nav")) localStorage.setItem("cs:nav", NAV);
} catch {}
