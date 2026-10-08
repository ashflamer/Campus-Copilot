// CampusScope Workspace UI - vanilla ES modules, no build step.
import { NAV, PROXY_NAV } from "./config.js";
import { api } from "./api.js";
import { $, $$ } from "./util.js";
import { refresh } from "./board.js";
import { renderMyDay, loadOrigins } from "./myday.js";
import { loadTimetable } from "./timetable.js";

// ------------------------------------------------------------ shell
$$(".tabs button").forEach((b) => b.addEventListener("click", () => {
  $$(".tabs button").forEach((x) => x.classList.toggle("on", x === b));
  $$(".tab").forEach((t) => t.classList.toggle("on", t.id === "tab-" + b.dataset.tab));
  localStorage.setItem("cs:tab", b.dataset.tab);
  if (b.dataset.tab === "myday") renderMyDay();
}));

const theme = localStorage.getItem("cs:theme");
if (theme) document.documentElement.dataset.theme = theme;
$("#theme").addEventListener("click", () => {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const cur = document.documentElement.dataset.theme || (dark ? "dark" : "light");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next; localStorage.setItem("cs:theme", next);
});

async function aiStatus() {
  const chip = $("#ai-chip");
  try {
    const s = await api.status();
    if (s.reachable && s.model_installed !== false) { chip.className = "chip ok"; chip.textContent = `✨ Gemma 4 · ${s.model}`; }
    else if (s.model) { chip.className = "chip off"; chip.textContent = `Gemma not reachable · rules fallback`; chip.title = s.error || (s.model_installed === false ? `Run: ollama pull ${s.model}` : ""); }
    else { chip.className = "chip off"; chip.textContent = "Gemma off · rules"; }
  } catch { chip.className = "chip off"; chip.textContent = "API offline"; }
}

function loadWidget() {
  // try the navigator directly, then through serve.py's same-origin proxy (hosted previews)
  const tryLoad = (base) => new Promise((res) => {
    const s = document.createElement("script");
    s.src = `${base}/widget.js`; s.dataset.nav = base;
    s.onload = () => res(true); s.onerror = () => { s.remove(); res(false); };
    document.body.appendChild(s);
  });
  return tryLoad(NAV).then((ok) => ok || NAV === PROXY_NAV ? ok : tryLoad(PROXY_NAV));
}

(async function init() {
  await Promise.all([refresh(), loadTimetable(), loadOrigins(), aiStatus(), loadWidget()]);
  const tab = localStorage.getItem("cs:tab");
  if (tab) $(`.tabs button[data-tab="${tab}"]`)?.click();
})();
