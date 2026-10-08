/* Campus Explorer - gamification layer for the Navigator UI.
 *
 * Students earn XP and badges for exploring campus with the navigator:
 * discovering places, planning routes, choosing step-free paths, sharing routes.
 * Progress lives only in this browser (localStorage). Emergency (HELP) routes
 * never earn XP - safety is not a game.
 *
 * Works by wrapping the navigator's existing functions (select, drawRoute,
 * shareRoute, drawMarkers), so the core map code stays unchanged.
 */
(function () {
  const KEY = "nav-game";
  const XP = {discover: 10, route: 15, stepfree: 10, share: 20, km: 1}; // km: per 100 m planned
  const BADGES = [
    {id: "first", e: "🥾", name: "First Steps", desc: "Plan your first route", test: s => s.routes >= 1},
    {id: "explorer", e: "🧭", name: "Explorer", desc: "Discover 5 places", test: s => s.seen.length >= 5},
    {id: "scholar", e: "📚", name: "Scholar", desc: "Visit a study place", test: s => s.cats.includes("study")},
    {id: "foodie", e: "🍴", name: "Foodie", desc: "Discover every food place", test: (s, d) => d.food.length > 0 && d.food.every(id => s.seen.includes(id))},
    {id: "ally", e: "♿", name: "Ally", desc: "Plan a step-free route", test: s => s.stepfree >= 1},
    {id: "guide", e: "🔗", name: "Campus Guide", desc: "Share a route with a friend", test: s => s.shares >= 1},
    {id: "km", e: "🏃", name: "1 km Club", desc: "Plan 1 km of walking in total", test: s => s.meters >= 1000},
    {id: "master", e: "🏆", name: "Campus Master", desc: "Discover every place on campus", test: (s, d) => d.all.length > 0 && d.all.every(id => s.seen.includes(id))},
  ];
  const TITLES = ["Fresher", "Wanderer", "Pathfinder", "Navigator", "Campus Pro", "Legend"];

  const blank = () => ({xp: 0, seen: [], cats: [], routes: 0, stepfree: 0, shares: 0, meters: 0, badges: []});
  let S;
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { S = blank(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

  const level = () => Math.floor(S.xp / 100) + 1;
  const title = () => TITLES[Math.min(TITLES.length - 1, level() - 1)];
  const dataSets = () => {
    const locs = (window.DATA_PUBLIC && window.DATA_PUBLIC()) || [];
    return {all: locs.map(l => l.id), food: locs.filter(l => l.category === "food").map(l => l.id)};
  };

  /* ------------------------------------------------------------ UI */
  const host = document.createElement("div");
  host.className = "game"; host.id = "game"; host.title = "Your Campus Explorer progress - click for badges";
  const header = document.querySelector("#panel header");
  header.after(host);

  const toastEl = document.createElement("div"); toastEl.className = "toastx"; document.body.appendChild(toastEl);
  const modal = document.createElement("div"); modal.className = "modalx"; document.body.appendChild(modal);

  function render() {
    const d = dataSets(), inLvl = S.xp % 100;
    host.innerHTML = `<div class="top"><div class="lvl">${level()}</div>
      <div class="who"><div class="title">${title()}</div><div class="sub">${S.xp} XP · ${100 - inLvl} XP to level ${level() + 1}</div></div></div>
      <div class="xpbar"><i style="width:${inLvl}%"></i></div>
      <div class="stats"><span>🧭 <b>${S.seen.length}</b>/${d.all.length || "?"} places</span><span>🗺️ <b>${S.routes}</b> routes</span><span>🚶 <b>${(S.meters / 1000).toFixed(1)}</b> km</span></div>
      <div class="badges">${BADGES.map(b => `<span class="${S.badges.includes(b.id) ? "on" : ""}" title="${b.name}: ${b.desc}">${b.e}</span>`).join("")}</div>`;
  }

  function showModal() {
    modal.innerHTML = `<div class="box"><button class="close" aria-label="Close">×</button>
      <h2>🏅 Campus Explorer</h2><div class="sub" style="color:var(--muted)">Level ${level()} · ${title()} · ${S.xp} XP · ${S.badges.length}/${BADGES.length} badges</div>
      <div class="grid">${BADGES.map(b => `<div class="bd ${S.badges.includes(b.id) ? "" : "off"}"><div class="e">${b.e}</div><div><b>${b.name}</b><small>${b.desc}</small></div></div>`).join("")}</div>
      <div class="sub" style="color:var(--muted);margin-top:12px;font-size:12px">Earn XP: discover a place +${XP.discover} · plan a route +${XP.route} · step-free route +${XP.stepfree} · share a route +${XP.share} · +1 per 100 m planned. HELP/emergency routes never give XP.</div>
      <button class="reset">Reset my progress</button></div>`;
    modal.classList.add("on");
    modal.querySelector(".close").onclick = () => modal.classList.remove("on");
    modal.querySelector(".reset").onclick = () => { S = blank(); save(); render(); refreshPins(); modal.classList.remove("on"); };
  }
  host.onclick = showModal;
  modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("on"); });

  let toastTimer;
  function toast(icon, head, text) {
    toastEl.innerHTML = `<div class="ic">${icon}</div><div><b>${head}</b><span>${text}</span></div>`;
    toastEl.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3200);
  }

  function floatXP(n) {
    const r = host.getBoundingClientRect();
    const f = document.createElement("div"); f.className = "xpfloat"; f.textContent = `+${n} XP`;
    f.style.left = (r.left + r.width - 70) + "px"; f.style.top = (r.top + 6) + "px";
    document.body.appendChild(f); setTimeout(() => f.remove(), 1300);
  }

  function confetti() {
    const bits = ["🎉", "✨", "⭐", "🎊", "💫"];
    for (let i = 0; i < 18; i++) {
      const c = document.createElement("div"); c.className = "confetti";
      c.textContent = bits[i % bits.length];
      c.style.left = (15 + Math.random() * 70) + "vw"; c.style.top = (Math.random() * 60) + "px";
      c.style.setProperty("--dx", (Math.random() * 400 - 200) + "px");
      c.style.setProperty("--rot", (Math.random() * 720 - 360) + "deg");
      c.style.animationDelay = (Math.random() * .2) + "s";
      document.body.appendChild(c); setTimeout(() => c.remove(), 1800);
    }
  }

  /* ------------------------------------------------------------ rules */
  function gain(n) {
    if (n <= 0) return;
    const before = level();
    S.xp += n; floatXP(n);
    if (level() > before) { toast("⬆️", `Level ${level()}: ${title()}!`, "Keep exploring campus"); confetti(); }
    checkBadges(); save(); render();
  }

  function checkBadges() {
    const d = dataSets();
    BADGES.forEach(b => {
      if (!S.badges.includes(b.id) && b.test(S, d)) {
        S.badges.push(b.id);
        setTimeout(() => { toast(b.e, `Badge unlocked: ${b.name}`, b.desc); confetti(); }, 400);
      }
    });
  }

  function discover(id) {
    const l = (window.DATA_PUBLIC && window.DATA_PUBLIC() || []).find(x => x.id === id);
    if (!l || S.seen.includes(id)) return;
    S.seen.push(id);
    if (l.category && !S.cats.includes(l.category)) S.cats.push(l.category);
    refreshPins();
    gain(XP.discover);
  }

  function refreshPins() {
    document.querySelectorAll(".leaflet-marker-icon .emoji-pin").forEach(el => el.classList.remove("seen"));
    const ms = window.MARKERS_PUBLIC ? window.MARKERS_PUBLIC() : {};
    S.seen.forEach(id => { const el = ms[id]?.getElement()?.querySelector(".emoji-pin"); if (el) el.classList.add("seen"); });
  }

  /* ------------------------------------------------------------ hooks */
  const wrap = (name, after) => {
    const orig = window[name];
    if (typeof orig !== "function") return;
    window[name] = function (...args) { const out = orig.apply(this, args); try { after(...args); } catch (e) { console.warn("game", e); } return out; };
  };

  let lastRouteKey = "";
  wrap("select", id => {
    if (!document.querySelector("#out")?.firstElementChild?.classList.contains("emg")) discover(id); // HELP: no XP
    refreshPins();   // select() swaps the pin icon, so re-apply the visited ticks
  });
  wrap("drawRoute", (r, color) => {
    if (!r || color === "#c41e3a") return;            // no XP for emergency routes
    const key = `${r.origin}>${r.destination}>${r.accessible}`;
    if (key === lastRouteKey) return;                  // same route redrawn: no double XP
    lastRouteKey = key;
    S.routes += 1; S.meters += r.distance_m || 0;
    let n = XP.route + Math.floor((r.distance_m || 0) / 100) * XP.km;
    if (r.accessible || r.uses_stairs === false) { S.stepfree += 1; n += XP.stepfree; }
    discover(r.destination);
    gain(n);
  });
  wrap("shareRoute", () => { S.shares += 1; gain(XP.share); });
  wrap("drawMarkers", () => setTimeout(refreshPins, 0));

  render();
  // first paint after the campus data has loaded
  const wait = setInterval(() => { if (window.DATA_PUBLIC && window.DATA_PUBLIC().length) { clearInterval(wait); render(); refreshPins(); } }, 300);
  setTimeout(() => clearInterval(wait), 15000);
  window.CampusGame = {state: () => ({...S}), reset: () => { S = blank(); save(); render(); refreshPins(); }};
})();
