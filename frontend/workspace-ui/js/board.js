// Assignments board: cards, drag & drop, sub-tasks, Gemma quick-add + breakdown.
import { api } from "./api.js";
import { $, $$, esc, state, STATUS, toast, dueInfo, navigateRoom } from "./util.js";

// ------------------------------------------------------------ board
function card(a) {
  const d = dueInfo(a.due);
  const open = state.open.has(a.id);
  const i = STATUS.indexOf(a.status);
  return `<article class="task p-${a.priority}" draggable="true" data-id="${a.id}">
    <div class="t">${esc(a.title)}</div>
    <div class="meta">
      ${a.course ? `<span class="chip">${esc(a.course)}</span>` : ""}
      <span class="chip due ${d.cls}">${d.text}</span>
      ${a.room ? `<span class="chip">🚪 ${esc(a.room)}</span>` : ""}
      ${a.source === "gemma" ? `<span class="chip" title="Created from one sentence by Gemma 4">✨ gemma</span>` : ""}
    </div>
    <div class="bar"><i style="width:${a.progress}%"></i></div>
    <div class="small muted">${a.progress}% · ${a.priority} priority${a.subtasks.length ? ` · ${a.subtasks.filter((s) => s.done).length}/${a.subtasks.length} steps` : ""}</div>
    ${open ? `<ul class="subs">${a.subtasks.map((s, k) => `<li class="${s.done ? "done" : ""}"><input type="checkbox" data-sub="${k}" ${s.done ? "checked" : ""}><span>${esc(s.text)}</span></li>`).join("") || '<li class="muted">No steps yet — try ✨ Break down</li>'}</ul>` : ""}
    <div class="acts">
      ${i > 0 ? `<button data-act="left" title="Move back">◀</button>` : ""}
      ${i < 2 ? `<button data-act="right" title="Move forward">▶</button>` : ""}
      <button data-act="toggle">${open ? "Hide steps" : "Steps"}</button>
      ${a.status !== "done" ? `<button data-act="breakdown" title="Gemma 4 splits this into small steps">✨ Break down</button>` : ""}
      ${a.room ? `<button data-act="nav" title="Open the Campus Navigator to this room">🗺️ Navigate</button>` : ""}
      <button data-act="del" title="Delete">🗑</button>
    </div>
  </article>`;
}

export function renderBoard() {
  for (const st of STATUS) {
    const col = $(`.col[data-status="${st}"]`);
    const items = state.items.filter((a) => a.status === st);
    $(".count", col).textContent = items.length;
    $(".list", col).innerHTML = items.map(card).join("") || '<div class="empty">Nothing here</div>';
  }
}

export async function refresh() {
  try {
    state.items = await api.list();
    renderBoard();
  } catch (e) {
    $(".board").insertAdjacentHTML("beforebegin", "");
    toast(`Assignments API offline (${e.message}). Start backend/assignments-api.`, 6000);
  }
}

async function patch(id, p) {
  const upd = await api.update(id, p);
  state.items = state.items.map((x) => (x.id === id ? upd : x));
  renderBoard();
}

$(".board").addEventListener("click", async (e) => {
  const el = e.target.closest(".task"); if (!el) return;
  const id = el.dataset.id, a = state.items.find((x) => x.id === id);
  const sub = e.target.dataset.sub;
  if (sub !== undefined) {
    const subtasks = a.subtasks.map((s, k) => (k === +sub ? { ...s, done: e.target.checked } : s));
    const allDone = subtasks.length && subtasks.every((s) => s.done);
    return patch(id, { subtasks, status: allDone ? "done" : a.status === "todo" ? "doing" : a.status });
  }
  const act = e.target.closest("button")?.dataset.act; if (!act) return;
  if (act === "left" || act === "right") return patch(id, { status: STATUS[STATUS.indexOf(a.status) + (act === "left" ? -1 : 1)] });
  if (act === "toggle") { state.open.has(id) ? state.open.delete(id) : state.open.add(id); return renderBoard(); }
  if (act === "nav") return navigateRoom(a.room);
  if (act === "del") { if (!confirm(`Delete “${a.title}”?`)) return; await api.remove(id); return refresh(); }
  if (act === "breakdown") {
    const b = e.target; b.disabled = true; b.textContent = "✨ thinking…";
    try {
      const r = await api.breakdown(id);
      state.open.add(id);
      state.items = state.items.map((x) => (x.id === id ? r.assignment : x));
      renderBoard();
      toast(`${r.subtasks.length} steps${r.estimate_hours ? ` · ~${r.estimate_hours}h` : ""} · by ${r.parser}`);
    } catch (err) { toast("Break down failed: " + err.message); b.disabled = false; }
  }
});

// drag & drop between columns
$(".board").addEventListener("dragstart", (e) => { const t = e.target.closest(".task"); if (t) e.dataTransfer.setData("text/plain", t.dataset.id); });
$$(".col").forEach((col) => {
  col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drop"); });
  col.addEventListener("dragleave", () => col.classList.remove("drop"));
  col.addEventListener("drop", (e) => {
    e.preventDefault(); col.classList.remove("drop");
    const id = e.dataTransfer.getData("text/plain");
    if (id) patch(id, { status: col.dataset.status });
  });
});

// ------------------------------------------------------------ quick add (Gemma)
$("#quick-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("#quick-input"), btn = $("#quick-btn"), text = input.value.trim();
  if (!text) return;
  btn.disabled = true; btn.textContent = "Thinking…";
  try {
    const { parsed, assignment } = await api.quickAdd(text);
    input.value = "";
    const r = $("#quick-result"); r.hidden = false;
    r.innerHTML = `Added <b>${esc(parsed.title)}</b>${parsed.course ? ` · ${esc(parsed.course)}` : ""} · ${dueInfo(parsed.due).text} · ${parsed.priority}${parsed.room ? ` · room ${esc(parsed.room)}` : ""} — understood by <b>${esc(parsed.parser)}</b>`;
    state.items.push(assignment);
    await refresh();
  } catch (err) { toast("Could not add: " + err.message); }
  btn.disabled = false; btn.textContent = "Add";
});

