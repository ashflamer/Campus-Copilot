// Where the two backends live. Override without editing code:
//   http://localhost:5173/?api=http://192.168.1.20:8766&nav=http://192.168.1.20:8765
const q = new URLSearchParams(location.search);
const host = location.hostname || "localhost";
export const API = (q.get("api") || localStorage.getItem("cs:api") || `http://${host}:8766`).replace(/\/$/, "");
export const NAV = (q.get("nav") || localStorage.getItem("cs:nav") || `http://${host}:8765`).replace(/\/$/, "");
if (q.get("api")) localStorage.setItem("cs:api", API);
if (q.get("nav")) localStorage.setItem("cs:nav", NAV);
