// Shared helpers + app state.
import { NAV } from "./config.js";

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const STATUS = ["todo", "doing", "done"];

export const state = { items: [], open: new Set(), timetable: [], locations: [], origin: localStorage.getItem("cs:origin") || "main_gate" };

// ------------------------------------------------------------ helpers
export function toast(msg, ms = 3200) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms);
}

export function dueInfo(due) {
  if (!due) return { text: "no due date", cls: "" };
  const d = new Date(due), now = new Date(), h = (d - now) / 36e5;
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (h < 0) return { text: `overdue · ${day}`, cls: "over" };
  if (h < 24) return { text: `due in ${Math.max(1, Math.round(h))}h · ${time}`, cls: "soon" };
  return { text: `due ${day} ${time}`, cls: h < 72 ? "soon" : "" };
}

export function navigateRoom(room) {
  if (window.CampusNav) window.CampusNav.open({ room, from: state.origin });
  else window.open(`${NAV}/?room=${encodeURIComponent(room)}&from=${encodeURIComponent(state.origin)}`, "_blank");
}
