// App shell: tabs, theme toggle, AI status chip, and wiring for My Day + Timetable.
import { api } from "./api.js";
import { $, $$, toast } from "./util.js";
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

// ------------------------------------------------------------ quick-add (Board, hours 3)
// The quick-add bar is part of the Board build; until that lands it must not
// submit the form and reload the page.
$("#quick-form").addEventListener("submit", (e) => {
  e.preventDefault();
  toast("Quick-add is wired up with the Board tab");
});

// ------------------------------------------------------------ boot
checkAI();
initMyDay();
initTimetable(() => {
  // A saved timetable changes the next-class card and the day plan.
  if ($("#tab-myday").classList.contains("on")) refreshMyDay();
});
showTab(localStorage.getItem("cs:tab") || "board");
