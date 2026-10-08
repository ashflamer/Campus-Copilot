// My Day: next class (navigator widget), overdue/due today, progress, Gemma day plan.
import { api, nav } from "./api.js";
import { $, esc, state, toast, dueInfo } from "./util.js";

// ------------------------------------------------------------ my day
export async function renderMyDay() {
  const nc = $("#next-class");
  if (window.CampusNav) window.CampusNav.nextClassCard(nc, state.timetable, state.origin);
  else nc.innerHTML = `<p class="muted small">Navigator offline — start backend/navigator-api to see your next class and walking time.</p>`;
  try {
    const [md, pr] = await Promise.all([api.myday(state.origin), api.progress()]);
    const rows = [...md.overdue, ...md.due_today];
    $("#due-list").innerHTML = rows.length ? rows.map((a) => {
      const d = dueInfo(a.due);
      return `<div class="duerow"><span>${esc(a.title)}</span><span class="due ${d.cls}">${d.text}</span></div>`;
    }).join("") : '<div class="empty">Nothing overdue or due today 🎉</div>';
    $("#progress").innerHTML = `<div class="prog"><div class="row"><b>Overall</b><span>${pr.overall}% · ${pr.done}/${pr.total} done</span></div><div class="bar"><i style="width:${pr.overall}%"></i></div></div>` +
      pr.by_course.map((c) => `<div class="prog"><div class="row"><span>${esc(c.course)}</span><span>${c.progress}%</span></div><div class="bar"><i style="width:${c.progress}%"></i></div></div>`).join("");
  } catch (e) { $("#due-list").innerHTML = `<div class="empty">API offline: ${esc(e.message)}</div>`; }
}

$("#plan-btn").addEventListener("click", async () => {
  const b = $("#plan-btn"); b.disabled = true; b.textContent = "✨ Planning…";
  try {
    const p = await api.plan();
    const slots = p.slots.map((s) => `<span class="chip">free ${s.start}–${s.end}</span>`).join("");
    $("#plan").innerHTML = `<div class="slots">${slots || '<span class="muted small">No free slots left today</span>'}</div>` +
      (p.items.map((it) => `<div class="plan-item"><div class="when">${it.start}–${it.end}</div><div><b>${esc(it.title)}</b><div class="small muted">${it.minutes} min · ${esc(it.why)}</div></div></div>`).join("") || '<div class="empty">Nothing to plan.</div>') +
      (p.tip ? `<div class="plan-tip">💡 ${esc(p.tip)}</div>` : "") +
      `<div class="tag-ai">planned by ${esc(p.parser)} at ${p.generated_at}</div>`;
  } catch (e) { toast("Plan failed: " + e.message); }
  b.disabled = false; b.textContent = "✨ Plan my day";
});

export async function loadOrigins() {
  try {
    const c = await nav.campus();
    state.locations = c.locations;
    $("#origin").innerHTML = c.locations.map((l) => `<option value="${l.id}" ${l.id === state.origin ? "selected" : ""}>${esc(l.name)}</option>`).join("");
  } catch { $("#origin").innerHTML = `<option>${esc(state.origin)}</option>`; }
}
$("#origin").addEventListener("change", (e) => { state.origin = e.target.value; localStorage.setItem("cs:origin", state.origin); renderMyDay(); });

