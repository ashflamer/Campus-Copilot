// App shell: tabs, theme toggle, AI status chip, and wiring for My Day + Timetable.
import { NAV, PROXY_NAV } from "./config.js";
import { api } from "./api.js";
import { $, $$ } from "./util.js";
import { refresh as refreshBoard } from "./board.js";
import { initMyDay, refreshMyDay } from "./myday.js";
import { initTimetable } from "./timetable.js";

// ------------------------------------------------------------ theme
const root = document.documentElement;
const savedTheme = localStorage.getItem("cs:theme");
if (savedTheme) root.dataset.theme = savedTheme;
$("#theme").addEventListener("click", () => {
  const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
  const current = root.dataset.theme || (systemDark ? "dark" : "light");
  root.dataset.theme = current === "dark" ? "light" : "dark";
  localStorage.setItem("cs:theme", root.dataset.theme);
});

// ------------------------------------------------------------ tabs
function showTab(name) {
  $$(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  $$("main > .tab").forEach((s) => s.classList.toggle("on", s.id === `tab-${name}`));
  localStorage.setItem("cs:tab", name);
  if (name === "myday") refreshMyDay();
}
$$(".tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

// ------------------------------------------------------------ AI chip
async function checkAI() {
  const chip = $("#ai-chip");
  try {
    const s = await api.status();
    if (s.model && s.provider && s.provider !== "none") {
      chip.textContent = `✨ Gemma 4 · ${s.model}`;
      chip.classList.add("ok");
    } else {
      chip.textContent = "AI: rules fallback";
      chip.classList.add("off");
    }
  } catch {
    chip.textContent = "AI: offline (rules fallback)";
    chip.classList.add("off");
  }
}

// ------------------------------------------------------------ navigator widget
// Loads widget.js (floating 🗺️ Campus button + Navigate pop-ups). Tries the navigator
// directly, then through serve.py's same-origin proxy for hosted previews.
function loadWidget() {
  const tryLoad = (base) => new Promise((res) => {
    const s = document.createElement("script");
    s.src = `${base}/widget.js`; s.dataset.nav = base;
    s.onload = () => res(true); s.onerror = () => { s.remove(); res(false); };
    document.body.appendChild(s);
  });
  return tryLoad(NAV).then((ok) => ok || NAV === PROXY_NAV ? ok : tryLoad(PROXY_NAV));
}

// ------------------------------------------------------------ boot
checkAI();
loadWidget();
refreshBoard();          // board.js also wires the Gemma quick-add bar
initMyDay();
initTimetable(() => {
  // A saved timetable changes the next-class card and the day plan.
  if ($("#tab-myday").classList.contains("on")) refreshMyDay();
});
showTab(localStorage.getItem("cs:tab") || "board");
