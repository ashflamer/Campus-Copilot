// Study Quest - gamification layer for the CampusScope workspace.
//
// Assignments become quests, finishing them earns XP, levels and badges,
// overdue work turns into a "boss", and the timetable gets class check-ins
// with an attendance streak. Daily quests reward a balanced study day.
//
// It hooks into the shared `api` object (every action in the app goes through
// it) and decorates the rendered board, so the rest of the app is unchanged.
// Progress is stored only in this browser (localStorage).
import { api } from "./api.js";
import { $, $$, esc, state, DAYS } from "./util.js";

const KEY = "cs:quest";
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => ymd(new Date());
const blank = () => ({ xp: 0, done: 0, early: 0, steps: 0, plans: 0, breakdowns: 0, added: 0, attended: 0,
  ttsaves: 0, navs: 0, badges: [], days: [], att: {}, daily: {} });
let S;
try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { S = blank(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

const TITLES = ["Fresher", "Learner", "Scholar", "Achiever", "Topper", "Legend"];
const level = () => Math.floor(S.xp / 100) + 1;
const title = () => TITLES[Math.min(TITLES.length - 1, level() - 1)];
const REWARD = { high: 75, medium: 50, low: 35 };
const EARLY_BONUS = 25;

const BADGES = [
  { id: "quest", e: "📜", name: "Quest Giver", desc: "Add a task with Gemma quick-add", test: () => S.added >= 1 },
  { id: "win", e: "🏆", name: "First Victory", desc: "Complete an assignment", test: () => S.done >= 1 },
  { id: "early", e: "🐦", name: "Early Bird", desc: "Finish before the due date", test: () => S.early >= 1 },
  { id: "steps", e: "✅", name: "Step by Step", desc: "Tick 10 sub-steps", test: () => S.steps >= 10 },
  { id: "split", e: "🧩", name: "Divide & Conquer", desc: "Break down 3 assignments", test: () => S.breakdowns >= 3 },
  { id: "plan", e: "🗓️", name: "Strategist", desc: "Use Plan my day", test: () => S.plans >= 1 },
  { id: "punct", e: "⏰", name: "Punctual", desc: "Check in to 3 classes", test: () => S.attended >= 3 },
  { id: "org", e: "🕐", name: "Organised", desc: "Save your timetable", test: () => S.ttsaves >= 1 },
  { id: "explore", e: "🗺️", name: "Explorer", desc: "Open the campus navigator 3 times", test: () => S.navs >= 3 },
  { id: "finish5", e: "🎯", name: "Finisher", desc: "Complete 5 assignments", test: () => S.done >= 5 },
  { id: "fire", e: "🔥", name: "On Fire", desc: "3-day study streak", test: () => streak() >= 3 },
  { id: "daily", e: "🎁", name: "Daily Champion", desc: "Finish all daily quests", test: () => Object.values(S.daily).some(d => d.chest) },
];

const DAILY = [
  { id: "step", e: "✅", text: "Tick 1 sub-step", xp: 10 },
  { id: "plan", e: "🗓️", text: "Plan your day with Gemma", xp: 10 },
  { id: "attend", e: "📍", text: "Check in to a class", xp: 10 },
  { id: "win", e: "🏆", text: "Conquer a quest", xp: 20 },
];
const CHEST = 30;

function streak() {
  const set = new Set(S.days); let n = 0; const d = new Date();
  while (set.has(ymd(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

/* ------------------------------------------------------------ UI pieces */
const player = document.createElement("div");
player.className = "player"; player.title = "Your Study Quest progress - click for badges";
$(".top .right").prepend(player);
const toastEl = Object.assign(document.createElement("div"), { className: "gtoast" }); document.body.appendChild(toastEl);
const modal = Object.assign(document.createElement("div"), { className: "gmodal" }); document.body.appendChild(modal);

function renderPlayer() {
  const p = S.xp % 100, st = streak();
  player.innerHTML = `<div class="lvl">${level()}</div><div class="info">
    <div class="t">${title()} ${st ? `<span class="streak">🔥 ${st}</span>` : ""}</div>
    <div class="bar"><i style="width:${p}%"></i></div><div class="xp">${S.xp} XP · ${100 - p} to Lv ${level() + 1}</div></div>`;
}

function showModal() {
  modal.innerHTML = `<div class="box"><button class="x" aria-label="Close">×</button>
    <h2>🎓 Study Quest</h2><div class="muted small">Level ${level()} · ${title()} · ${S.xp} XP · ${S.badges.length}/${BADGES.length} badges</div>
    <div class="stats"><span>🏆 <b>${S.done}</b> conquered</span><span>✅ <b>${S.steps}</b> steps</span><span>📍 <b>${S.attended}</b> check-ins</span><span>🔥 <b>${streak()}</b>-day streak</span></div>
    <div class="grid">${BADGES.map(b => `<div class="bd ${S.badges.includes(b.id) ? "" : "off"}"><div class="e">${b.e}</div><div><b>${b.name}</b><small>${b.desc}</small></div></div>`).join("")}</div>
    <p class="muted small" style="margin-top:12px">XP: finish a quest +${REWARD.low}/${REWARD.medium}/${REWARD.high} (by priority) · early bonus +${EARLY_BONUS} · sub-step +10 · check in to class +20 · quick-add / break down / plan +10-15 · daily chest +${CHEST}.</p>
    <button class="reset">Reset my progress</button></div>`;
  modal.classList.add("on");
  $(".x", modal).onclick = () => modal.classList.remove("on");
  $(".reset", modal).onclick = () => { S = blank(); save(); refreshAll(); modal.classList.remove("on"); };
}
player.onclick = showModal;
modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("on"); });

let tT;
function gtoast(icon, head, text) {
  toastEl.innerHTML = `<div class="ic">${icon}</div><div><b>${esc(head)}</b><span>${esc(text)}</span></div>`;
  toastEl.classList.add("show"); clearTimeout(tT); tT = setTimeout(() => toastEl.classList.remove("show"), 3200);
}
function floatXP(n) {
  const r = player.getBoundingClientRect();
  const f = Object.assign(document.createElement("div"), { className: "gxp", textContent: `+${n} XP` });
  f.style.left = (r.left + 20) + "px"; f.style.top = (r.bottom - 10) + "px";
  document.body.appendChild(f); setTimeout(() => f.remove(), 1300);
}
function confetti() {
  const bits = ["🎉", "✨", "⭐", "🎊", "🏆"];
  for (let i = 0; i < 22; i++) {
    const c = Object.assign(document.createElement("div"), { className: "gconf", textContent: bits[i % bits.length] });
    c.style.left = (10 + Math.random() * 80) + "vw"; c.style.top = (Math.random() * 80) + "px";
    c.style.setProperty("--dx", (Math.random() * 400 - 200) + "px"); c.style.setProperty("--rot", (Math.random() * 720 - 360) + "deg");
    c.style.animationDelay = (Math.random() * .25) + "s";
    document.body.appendChild(c); setTimeout(() => c.remove(), 1900);
  }
}

/* ------------------------------------------------------------ rules */
function gain(n, why) {
  if (n <= 0) return;
  const before = level();
  S.xp += n;
  if (!S.days.includes(today())) S.days.push(today());
  floatXP(n);
  if (level() > before) { gtoast("⬆️", `Level ${level()}: ${title()}!`, why || "Keep going"); confetti(); }
  checkBadges(); save(); renderPlayer();
}
function checkBadges() {
  BADGES.forEach(b => {
    if (!S.badges.includes(b.id) && b.test()) {
      S.badges.push(b.id);
      setTimeout(() => { gtoast(b.e, `Badge unlocked: ${b.name}`, b.desc); confetti(); }, 500);
    }
  });
}
function dailyDone(id) {
  const d = S.daily[today()] || (S.daily[today()] = { done: [] });
  if (d.done.includes(id)) return;
  d.done.push(id);
  const q = DAILY.find(x => x.id === id); gain(q.xp, `Daily quest: ${q.text}`);
  if (!d.chest && DAILY.every(x => d.done.includes(x.id))) { d.chest = true; gain(CHEST); gtoast("🎁", "Daily chest opened!", `All daily quests done: +${CHEST} XP`); confetti(); }
  save(); renderDaily();
}

/* ------------------------------------------------------------ hooks on the api */
const wrap = (name, fn) => {
  const orig = api[name];
  api[name] = async (...args) => { const res = await orig(...args); try { fn(res, ...args); } catch (e) { console.warn("quest", e); } return res; };
};
// snapshot BEFORE an update so we can compare
const origUpdate = api.update;
api.update = async (id, patch) => {
  const before = state.items.find(x => x.id === id);
  const prev = before ? { status: before.status, steps: before.subtasks.filter(s => s.done).length } : null;
  const res = await origUpdate(id, patch);
  try { onUpdate(prev, res); } catch (e) { console.warn("quest", e); }
  return res;
};
function onUpdate(prev, a) {
  if (!prev || !a) return;
  const steps = a.subtasks.filter(s => s.done).length;
  if (steps > prev.steps) { S.steps += steps - prev.steps; gain(10 * (steps - prev.steps), "Step done"); dailyDone("step"); }
  if (prev.status === "todo" && a.status === "doing") gain(5, "Quest started");
  if (prev.status !== "done" && a.status === "done") {
    S.done += 1;
    let xp = REWARD[a.priority] || 50;
    const early = a.due && new Date(a.due) > new Date();
    if (early) { S.early += 1; xp += EARLY_BONUS; }
    gain(xp, "Quest conquered");
    gtoast("🏆", `Quest conquered: ${a.title}`, `+${xp} XP${early ? ` (incl. +${EARLY_BONUS} early bonus 🐦)` : ""}`);
    confetti(); dailyDone("win");
  }
}
wrap("quickAdd", () => { S.added += 1; gain(10, "New quest"); });
wrap("breakdown", () => { S.breakdowns += 1; gain(10, "Quest split into steps"); });
wrap("plan", () => { S.plans += 1; gain(15, "Day planned"); dailyDone("plan"); });
wrap("saveTimetable", (saved, entries) => { S.ttsaves += 1; if (Array.isArray(entries)) state.timetable = entries; gain(10, "Timetable saved"); renderAttendance(); });

// opening the navigator (widget loads later, so wrap when it appears)
const navWait = setInterval(() => {
  if (!window.CampusNav || window.CampusNav._quest) return;
  const o = window.CampusNav.open;
  window.CampusNav.open = (...a) => { S.navs += 1; gain(5, "Explored campus"); return o(...a); };
  window.CampusNav._quest = true; clearInterval(navWait);
}, 500);

/* ------------------------------------------------------------ board decoration */
const COLS = { todo: "📜 Quests", doing: "⚔️ In battle", done: "🏆 Conquered" };
function decorateBoard() {
  $$(".col").forEach(col => {
    const h = $("h3", col); const t = h && h.firstChild;
    if (t && t.nodeType === 3 && COLS[col.dataset.status]) t.textContent = COLS[col.dataset.status] + " ";
  });
  $$(".task").forEach(el => {
    if (el.dataset.q) return; el.dataset.q = 1;
    const a = state.items.find(x => x.id === el.dataset.id); if (!a) return;
    const done = a.status === "done";
    const r = document.createElement("span"); r.className = "reward";
    r.textContent = done ? "🏆 won" : `+${(REWARD[a.priority] || 50) + (a.due && new Date(a.due) > new Date() ? EARLY_BONUS : 0)} XP`;
    el.prepend(r);
    if (done) { el.classList.add("won"); return; }
    if (a.due) {
      const h = (new Date(a.due) - new Date()) / 36e5;
      if (h < 24) {
        el.classList.add("boss");
        const tag = document.createElement("div"); tag.className = "bosstag";
        tag.textContent = h < 0 ? "💀 OVERDUE BOSS" : "🔥 BOSS · due within 24h";
        el.prepend(tag);
      }
    }
    const hp = document.createElement("div"); hp.className = "hp";
    hp.textContent = el.classList.contains("boss") ? `❤️ Boss HP ${100 - a.progress}% · finish steps to defeat it` : `🛡️ Quest ${a.progress}% done · tick steps for +10 XP each`;
    $(".bar", el)?.after(hp);
  });
}
new MutationObserver(decorateBoard).observe($(".board"), { childList: true, subtree: true });

/* ------------------------------------------------------------ daily quests (My Day) */
const dailyCard = document.createElement("div"); dailyCard.className = "card quests";
$("#tab-myday .grid2 > div")?.prepend(dailyCard);
function renderDaily() {
  const d = S.daily[today()] || { done: [] };
  const pct = Math.round(100 * d.done.length / DAILY.length);
  dailyCard.innerHTML = `<div class="qhead"><h3>🎯 Daily quests</h3><div class="ring" style="--p:${pct}"><span>${pct}%</span></div></div>
    ${DAILY.map(q => `<div class="q ${d.done.includes(q.id) ? "done" : ""}"><div class="ic">${q.e}</div><div class="tx">${q.text}</div>
      ${d.done.includes(q.id) ? '<span class="ok">✓</span>' : `<small>+${q.xp} XP</small>`}</div>`).join("")}
    <div class="muted small" style="margin-top:6px">${d.chest ? "🎁 Daily chest opened. See you tomorrow!" : `Finish all 4 to open the 🎁 daily chest (+${CHEST} XP)`}</div>`;
}

/* ------------------------------------------------------------ class check-ins (Timetable + My Day) */
const attCard = document.createElement("div"); attCard.className = "card att";
$("#tab-timetable")?.prepend(attCard);
const attCard2 = attCard.cloneNode(); $("#tab-myday .grid2 > div:last-child")?.append(attCard2);
const weekday = () => (new Date().getDay() + 6) % 7; // Mon=0
const attKey = e => `${today()}|${e.start}|${e.course}`;
function attendanceRate() {
  const keys = Object.keys(S.att);
  return keys.length ? Math.round(100 * keys.filter(k => S.att[k]).length / keys.length) : null;
}
let ttFetch = null;
function renderAttendance() {
  // the timetable may not be in shared state yet (it loads in parallel) - fetch it once
  if (!(state.timetable || []).length && !ttFetch) {
    ttFetch = api.timetable().then(t => { state.timetable = Array.isArray(t) ? t : t.entries || []; renderAttendance(); }).catch(() => {});
  }
  const list = (state.timetable || []).filter(e => +e.day === weekday()).sort((a, b) => a.start.localeCompare(b.start));
  const html = `<h3>📍 Today's classes · check in</h3>
    ${list.length ? list.map(e => `<div class="cls"><span class="when">${esc(e.start)}–${esc(e.end)}</span><span class="nm"><b>${esc(e.course)}</b> <span class="muted small">${esc(e.room)}</span></span>
      ${S.att[attKey(e)] ? '<span class="done">✓ checked in</span>' : `<button class="here" data-k="${esc(attKey(e))}">✅ I'm here +20</button>`}</div>`).join("")
      : `<div class="empty">No classes today (${DAYS[weekday()]}). Enjoy! 🎉</div>`}
    <div class="rate">📈 Classes checked in: <b>${S.attended}</b>${S.attended ? ` · ⏰ ${S.attended >= 3 ? "Punctual badge earned" : `${3 - S.attended} more for the Punctual badge`}` : ""}</div>`;
  [attCard, attCard2].forEach(c => {
    c.innerHTML = html;
    $$("button.here", c).forEach(b => b.onclick = () => {
      S.att[b.dataset.k] = true; S.attended += 1; gain(20, "Checked in to class"); dailyDone("attend"); renderAttendance();
    });
  });
  // highlight today's rows in the timetable editor
  $$("#tt-body tr").forEach(tr => tr.classList.toggle("today", +($("select", tr)?.value) === weekday()));
}
new MutationObserver(renderAttendance).observe($("#tt-body"), { childList: true });

/* ------------------------------------------------------------ start */
function refreshAll() { renderPlayer(); renderDaily(); renderAttendance(); $$(".task").forEach(t => delete t.dataset.q); $$(".reward,.bosstag,.hp").forEach(n => n.remove()); decorateBoard(); }
refreshAll();
window.StudyQuest = { state: () => JSON.parse(JSON.stringify(S)), reset: () => { S = blank(); save(); refreshAll(); } };
