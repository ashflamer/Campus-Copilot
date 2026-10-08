// Weekly timetable editor: add / edit / remove class rows, validate, then Save.
// The saved entries drive the My Day next-class card and the day plan.
import { api } from "./api.js";
import { $, $$, esc, toast, DAYS, navigateRoom } from "./util.js";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

let onSavedCb = () => {};

export async function initTimetable(onSaved = () => {}) {
  onSavedCb = onSaved;
  $("#tt-add").addEventListener("click", () =>
    addRow({ day: 0, start: "09:00", end: "10:00", course: "", room: "" }, true));
  $("#tt-save").addEventListener("click", save);
  const body = $("#tt-body");
  body.addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      del.closest("tr").remove();
      ensureEmptyHint();
      return;
    }
    const nav = e.target.closest("[data-nav]");
    if (nav) navigateRoom(nav.dataset.nav);
  });
  // Clear the error highlight as soon as the user fixes a field.
  body.addEventListener("input", (e) => e.target.classList.remove("bad"));
  await load();
}

async function load() {
  try {
    const t = await api.timetable();
    const entries = Array.isArray(t) ? t : t.entries || [];
    $("#tt-body").innerHTML = "";
    entries
      .slice()
      .sort((a, b) => a.day - b.day || String(a.start).localeCompare(String(b.start)))
      .forEach((e) => addRow(e, false));
    ensureEmptyHint();
  } catch (err) {
    toast(`Could not load timetable: ${err.message}`);
  }
}

function addRow(e, focus) {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><select class="tt-day" aria-label="Day">${DAYS.map((d, i) =>
      `<option value="${i}"${Number(e.day) === i ? " selected" : ""}>${d}</option>`).join("")}</select></td>
    <td><input class="tt-start" type="time" aria-label="Start" value="${esc(e.start)}"></td>
    <td><input class="tt-end" type="time" aria-label="End" value="${esc(e.end)}"></td>
    <td><input class="tt-course" type="text" aria-label="Course" maxlength="120" placeholder="Course name" value="${esc(e.course)}"></td>
    <td><div class="row tt-room-cell">
          <input class="tt-room" type="text" aria-label="Room" maxlength="20" placeholder="A-402" value="${esc(e.room)}">
          <button type="button" class="icon" data-nav="" title="Navigate to this room" aria-label="Navigate to room">🗺️</button>
        </div></td>
    <td><button type="button" class="icon" data-del title="Remove row" aria-label="Remove row">✕</button></td>`;
  tr.querySelector("[data-nav]").addEventListener("click", () => {
    const room = tr.querySelector(".tt-room").value.trim();
    if (room) navigateRoom(room);
    else toast("Enter a room code first");
  });
  $("#tt-body").appendChild(tr);
  ensureEmptyHint();
  if (focus) tr.querySelector(".tt-course").focus();
}

function ensureEmptyHint() {
  const body = $("#tt-body");
  body.querySelector(".tt-empty")?.remove();
  if (!body.querySelector("tr")) {
    body.insertAdjacentHTML("beforeend", `<tr class="tt-empty"><td colspan="6" class="empty">No classes yet. Add a row, then Save.</td></tr>`);
  }
}

// Read + validate every row. Returns { entries } or { error } and highlights the bad field.
function collect() {
  const entries = [];
  for (const tr of $$("#tt-body tr:not(.tt-empty)")) {
    const f = {
      day: Number(tr.querySelector(".tt-day").value),
      start: tr.querySelector(".tt-start").value,
      end: tr.querySelector(".tt-end").value,
      course: tr.querySelector(".tt-course").value.trim(),
      room: tr.querySelector(".tt-room").value.trim().toUpperCase(),
    };
    const fail = (field, msg) => {
      tr.querySelector(`.${field}`).classList.add("bad");
      return { error: msg };
    };
    if (!f.course) return fail("tt-course", "Every class needs a course name");
    if (!TIME.test(f.start)) return fail("tt-start", `Pick a start time for ${f.course}`);
    if (!TIME.test(f.end)) return fail("tt-end", `Pick an end time for ${f.course}`);
    if (f.end <= f.start) return fail("tt-end", `${f.course} must end after it starts`);
    entries.push(f);
  }
  return { entries };
}

async function save() {
  const btn = $("#tt-save");
  const { entries, error } = collect();
  if (error) {
    toast(error);
    return;
  }
  btn.disabled = true;
  try {
    const saved = await api.saveTimetable(entries);
    toast(`Saved ${saved.length ?? entries.length} class${entries.length === 1 ? "" : "es"}`);
    onSavedCb(saved);
  } catch (err) {
    toast(`Save failed: ${err.message}`);
  } finally {
    btn.disabled = false;
  }
}
