// Arcade FX layer for the workspace: intro splash, star field, sliding tab pill,
// staggered card deals, 3D tilt, button ripples, combo counter, level-up overlay
// and tiny synthesized sound effects (no audio files; mute with the 🔊 button).
// Purely visual: it only watches the DOM, so the app logic is untouched.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

/* ------------------------------------------------------------ sound (WebAudio) */
let ctx, muted = store.get("cs:mute") === "1";
function tone(freq, dur = 0.09, type = "square", vol = 0.05, when = 0) {
  if (muted) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + when;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch {}
}
const SFX = {
  click: () => tone(660, 0.04, "square", 0.025),
  coin: () => { tone(988, 0.07, "square", 0.04); tone(1319, 0.12, "square", 0.04, 0.07); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, "triangle", 0.06, i * 0.09)),
  level: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, "square", 0.05, i * 0.08)),
  badge: () => [880, 1175, 1568].forEach((f, i) => tone(f, 0.1, "triangle", 0.05, i * 0.08)),
  whoosh: () => tone(220, 0.15, "sawtooth", 0.02),
};
const soundBtn = document.createElement("button");
soundBtn.id = "fx-sound"; soundBtn.className = "icon"; soundBtn.title = "Sound effects on/off";
const paintSound = () => soundBtn.textContent = muted ? "🔇" : "🔊";
soundBtn.onclick = () => { muted = !muted; store.set("cs:mute", muted ? "1" : "0"); paintSound(); SFX.coin(); };
paintSound(); $(".top .right")?.append(soundBtn);

/* ------------------------------------------------------------ intro splash (once per session) */
let introSeen = false;
try { introSeen = sessionStorage.getItem("cs:intro") === "1"; } catch {}
if (!calm && !introSeen && !new URLSearchParams(location.search).has("nointro")) {
  const sp = document.createElement("div"); sp.id = "fx-splash";
  sp.innerHTML = `<div><div class="logo">🎓</div><h1>CAMPUSSCOPE</h1><div class="sub">What to do · where to go · powered by Gemma 4</div><div class="press">PRESS START</div></div>`;
  document.body.appendChild(sp);
  const go = () => { if (sp.classList.contains("out")) return; sp.classList.add("out"); SFX.level(); try { sessionStorage.setItem("cs:intro", "1"); } catch {} setTimeout(() => sp.remove(), 700); };
  sp.onclick = go; addEventListener("keydown", go, { once: true }); setTimeout(go, 2200);
}

/* ------------------------------------------------------------ star field */
if (!calm) {
  const c = document.createElement("canvas"); c.id = "fx-stars"; document.body.prepend(c);
  const g = c.getContext("2d"); let W, H, stars;
  const size = () => { W = c.width = innerWidth; H = c.height = innerHeight; stars = Array.from({ length: Math.min(90, (W * H) / 14000 | 0) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.6 + .3, s: Math.random() * .3 + .05, p: Math.random() * 6 })); };
  size(); addEventListener("resize", size);
  const col = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#a4123f";
  (function loop(t) {
    g.clearRect(0, 0, W, H); const a = col();
    for (const s of stars) { s.y -= s.s; if (s.y < -4) { s.y = H + 4; s.x = Math.random() * W; }
      g.globalAlpha = .35 + .35 * Math.sin(t / 700 + s.p); g.fillStyle = s.r > 1.4 ? a : "#f2a541";
      g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill(); }
    requestAnimationFrame(loop);
  })(0);
}

/* ------------------------------------------------------------ sliding tab pill */
const tabs = $(".tabs");
if (tabs) {
  const pill = document.createElement("span"); pill.className = "pill"; tabs.prepend(pill);
  const place = () => { const on = $("button.on", tabs); if (!on) return; pill.style.left = on.offsetLeft + "px"; pill.style.width = on.offsetWidth + "px"; };
  new MutationObserver(place).observe(tabs, { subtree: true, attributes: true, attributeFilter: ["class"] });
  addEventListener("resize", place); setTimeout(place, 50);
  tabs.addEventListener("click", () => SFX.whoosh());
}

/* ------------------------------------------------------------ staggered card deal */
function stagger(root) { $$(".task", root).forEach((t, i) => { if (!t.dataset.fx) { t.dataset.fx = 1; t.style.animationDelay = Math.min(i, 10) * 45 + "ms"; } }); }
const board = $(".board");
if (board) new MutationObserver(() => stagger(board)).observe(board, { childList: true, subtree: true });

/* ------------------------------------------------------------ 3D tilt on hover */
if (!calm) {
  document.addEventListener("mousemove", e => {
    const t = e.target.closest?.(".task"); if (!t || t.classList.contains("boss")) return;
    const r = t.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    t.style.transform = `perspective(700px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateY(-2px)`;
  });
  document.addEventListener("mouseout", e => { const t = e.target.closest?.(".task"); if (t && !t.contains(e.relatedTarget)) t.style.transform = ""; });
}

/* ------------------------------------------------------------ button ripple + click sound */
document.addEventListener("pointerdown", e => {
  const b = e.target.closest?.("button"); if (!b || b.id === "fx-sound") return;
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height);
  const s = document.createElement("span"); s.className = "ripple";
  s.style.width = s.style.height = d + "px"; s.style.left = (e.clientX - r.left - d / 2) + "px"; s.style.top = (e.clientY - r.top - d / 2) + "px";
  b.appendChild(s); setTimeout(() => s.remove(), 650); SFX.click();
});

/* ------------------------------------------------------------ react to game events (from game.js) */
const combo = Object.assign(document.createElement("div"), { id: "fx-combo" }); document.body.appendChild(combo);
const lvl = Object.assign(document.createElement("div"), { id: "fx-levelup" }); document.body.appendChild(lvl);
let hits = 0, comboT;
function onXP() {
  SFX.coin(); hits++;
  $(".player")?.classList.remove("bump"); void $(".player")?.offsetWidth; $(".player")?.classList.add("bump");
  if (hits >= 2) { combo.textContent = `COMBO ×${hits}`; combo.classList.add("on"); }
  clearTimeout(comboT); comboT = setTimeout(() => { hits = 0; combo.classList.remove("on"); }, 6000);
}
new MutationObserver(muts => {
  for (const m of muts) for (const n of m.addedNodes) {
    if (n.nodeType !== 1) continue;
    if (n.classList.contains("gxp")) onXP();
  }
}).observe(document.body, { childList: true });

const gt = $(".gtoast");
if (gt) new MutationObserver(() => {
  if (!gt.classList.contains("show")) return;
  const head = $("b", gt)?.textContent || "";
  if (/^Level \d+/.test(head)) {
    SFX.level();
    lvl.innerHTML = `<div class="big">LEVEL UP!<small>${head}</small></div>`;
    lvl.classList.remove("on"); void lvl.offsetWidth; lvl.classList.add("on");
  } else if (/Badge unlocked/.test(head)) SFX.badge();
  else if (/Quest conquered/.test(head)) {
    SFX.win();
    $$(".task.won").slice(-1).forEach(t => { t.classList.add("zap"); setTimeout(() => t.classList.remove("zap"), 700); });
  }
}).observe(gt, { attributes: true, attributeFilter: ["class"] });
