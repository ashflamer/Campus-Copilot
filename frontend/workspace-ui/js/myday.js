// My Day: next class (from the student's timetable), overdue / due-today list,
// progress, and Gemma's time-boxed plan for today's free gaps.
import { api, nav } from "./api.js";
import { $, esc, state, toast, dueInfo, navigateRoom, DAYS } from "./util.js";

const FALLBACK_ORIGIN = { id: "main_gate", name: "Main Gate" };

export async function initMyDay() {
  await loadOrigins();
  $("#origin").addEventListener("change", (e) => {
    state.origin = e.target.value;
    localStorage.setItem("cs:origin", state.origin);
    refreshMyDay();
  });
  $("#plan-btn").addEventListener("click", makePlan);
  $("#plan").innerHTML = `<p class="empty">Press <b>Plan my day</b> to get a plan for today's free gaps.</p>`;
  await refreshMyDay();
}

// ------------------------------------------------------------ origin picker
async function loadOrigins() {
  let locations = [FALLBACK_ORIGIN];
  try {
    const campus = await nav.campus();
    locations = campus.locations.filter((l) => l.id).map((l) => ({ id: l.id, name: l.name || l.id }));
  } catch {
    // Navigator offline: keep the single fallback origin so My Day still renders.
  }
  if (!locations.some((l) => l.id === state.origin)) state.origin = locations[0].id;
  $("#origin").innerHTML = locations
    .map((l) => `<option value="${esc(l.id)}"${l.id === state.origin ? " selected" : ""}>${esc(l.name)}</option>`)
    .join("");
}

// ------------------------------------------------------------ refresh
export async function refreshMyDay() {
  await Promise.allSettled([renderNextClass(), renderDue(), renderProgress()]);
}

async function renderNextClass() {
  const box = $("#next-class");
  try {
    const entries = await loadEntries();
    const { next_class: nc, route } = await nav.nextClass(entries, state.origin);
    if (!nc) {
      box.innerHTML = `<p class="empty">No more classes in the next week. Enjoy the free time ☕</p>`;
      return;
    }
    const when = nc.in_progress
      ? `<b>In progress</b> · ends ${esc(nc.end)}`
      : `Starts in <b>${nc.starts_in_min} min</b> · ${esc(nc.start)}–${esc(nc.end)}`;
    const walk = route ? route.minutes : null;
    // Leave-now warning: you need the walk time plus a 5-minute buffer before the class starts.
    const leaveNow = walk !== null && !nc.in_progress && nc.starts_in_min <= walk + 5;
    box.innerHTML = `
      <div class="nc">
        <div class="nc-course">${esc(nc.course)}</div>
        <div class="muted small">${esc(nc.day_label || dayLabel(nc.day))} · ${when}</div>
        <div class="row" style="margin-top:8px">
          <span class="chip">🚪 ${esc(nc.room || "room TBA")}</span>
          ${walk !== null ? `<span class="chip">🚶 ${walk} min walk · ${route.distance_m} m</span>` : ""}
          ${nc.room ? `<button class="primary" data-nav="${esc(nc.room)}">🗺️ Navigate</button>` : ""}
        </div>
        ${leaveNow ? `<p class="due over" style="margin:10px 0 0">⚠ Leave now to make it on time.</p>` : ""}
        ${walk === null && nc.room && state.origin ? `<p class="muted small" style="margin:6px 0 0">Walking time unavailable for this origin.</p>` : ""}
      </div>`;
    const btn = box.querySelector("[data-nav]");
    if (btn) btn.addEventListener("click", () => navigateRoom(btn.dataset.nav));
  } catch (err) {
    box.innerHTML = `<p class="empty">Could not load the timetable: ${esc(err.message)}</p>`;
  }
}

async function renderDue() {
  const box = $("#due-list");
  try {
    const items = await api.list();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const due = items
      .filter((a) => a.status !== "done" && a.due && new Date(a.due) <= endOfToday)
      .sort((a, b) => new Date(a.due) - new Date(b.due));
    if (!due.length) {
      box.innerHTML = `<p class="empty">Nothing overdue or due today. 🎉</p>`;
      return;
    }
    box.innerHTML = due
      .map((a) => {
        const info = dueInfo(a.due);
        return `<div class="duerow"><span>${esc(a.title)}<span class="muted small"> · ${esc(a.course || "")}</span></span>
          <span class="due ${info.cls}">${esc(info.text)}</span></div>`;
      })
      .join("");
  } catch (err) {
    box.innerHTML = `<p class="empty">Could not load assignments: ${esc(err.message)}</p>`;
  }
}

async function renderProgress() {
  const box = $("#progress");
  try {
    const items = await api.list();
    if (!items.length) {
      box.innerHTML = `<p class="empty">No assignments yet.</p>`;
      return;
    }
    const done = items.filter((a) => a.status === "done").length;
    const pct = Math.round((100 * done) / items.length);
    const doing = items.filter((a) => a.status === "doing").length;
    box.innerHTML = `
      <div class="prog">
        <div class="row"><span>${done} of ${items.length} done</span><span>${pct}%</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="muted small">${doing} in progress</div>
      </div>`;
  } catch (err) {
    box.innerHTML = `<p class="empty">Could not load progress: ${esc(err.message)}</p>`;
  }
}

// ------------------------------------------------------------ Gemma day plan
async function makePlan() {
  const btn = $("#plan-btn");
  const out = $("#plan");
  btn.disabled = true;
  btn.textContent = "Planning…";
  try {
    const plan = await api.plan();
    const items = plan.items || plan.plan || [];
    if (!items.length) {
      out.innerHTML = `<p class="empty">${esc(plan.message || "Nothing urgent left to schedule today. 🎉")}</p>`;
    } else {
      out.innerHTML = items
        .map((it) => `<div class="plan-item">
            <div class="when">${esc(it.start)}–${esc(it.end)}</div>
            <div><div><b>${esc(it.title)}</b></div>${it.reason ? `<div class="muted small">${esc(it.reason)}</div>` : ""}</div>
          </div>`)
        .join("");
    }
    if (plan.tip || plan.summary) out.insertAdjacentHTML("beforeend", `<div class="plan-tip">${esc(plan.tip || plan.summary)}</div>`);
    if (plan.source) out.insertAdjacentHTML("beforeend", `<div class="tag-ai">planned by ${esc(plan.source)}</div>`);
  } catch (err) {
    toast(`Plan failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "✨ Plan my day";
  }
}

// ------------------------------------------------------------ helpers
async function loadEntries() {
  const t = await api.timetable();
  state.timetable = Array.isArray(t) ? t : t.entries || [];
  return state.timetable;
}


function dayLabel(d) {
  return DAYS[d] ?? "";
}
