// Weekly timetable editor (room codes link to the navigator).
import { api } from "./api.js";
import { $, $$, esc, state, toast, DAYS, navigateRoom } from "./util.js";

// ------------------------------------------------------------ timetable
function ttRow(e = { day: 0, start: "09:00", end: "09:50", course: "", room: "" }) {
  return `<tr>
    <td><select>${DAYS.map((d, i) => `<option value="${i}" ${+e.day === i ? "selected" : ""}>${d}</option>`).join("")}</select></td>
    <td><input type="time" value="${esc(e.start)}"></td><td><input type="time" value="${esc(e.end)}"></td>
    <td><input value="${esc(e.course)}" placeholder="Course"></td>
    <td><input value="${esc(e.room)}" placeholder="A-402" size="6"></td>
    <td class="row">${e.room ? `<button data-room="${esc(e.room)}" title="Navigate">🗺️</button>` : ""}<button data-del title="Remove">✕</button></td></tr>`;
}
export async function loadTimetable() {
  try { state.timetable = await api.timetable(); } catch { state.timetable = []; }
  $("#tt-body").innerHTML = state.timetable.map(ttRow).join("");
}
$("#tt-add").addEventListener("click", () => $("#tt-body").insertAdjacentHTML("beforeend", ttRow()));
$("#tt-body").addEventListener("click", (e) => {
  if (e.target.dataset.del !== undefined) e.target.closest("tr").remove();
  if (e.target.dataset.room) navigateRoom(e.target.dataset.room);
});
$("#tt-save").addEventListener("click", async () => {
  const entries = $$("#tt-body tr").map((tr) => {
    const [day, start, end, course, room] = $$("select,input", tr).map((x) => x.value);
    return { day: +day, start, end, course, room: room.toUpperCase() };
  }).filter((e) => e.course);
  state.timetable = await api.saveTimetable(entries);
  toast(`Saved ${state.timetable.length} classes`);
  loadTimetable();
});

