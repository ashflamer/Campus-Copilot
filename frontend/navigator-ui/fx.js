/* Arcade FX layer for the Campus Navigator: synthesized sound effects, level-up
 * overlay, XP bump, staggered pin drops. The route draw/march, radar pulse and
 * card springs live in fx.css. Watches the DOM only - map logic is untouched. */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  let ctx, muted = store.get("nav-mute") === "1";
  function tone(f, d = .09, type = "square", v = .05, w = 0) {
    if (muted) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + w;
      o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + d + .02);
    } catch {}
  }
  const SFX = {
    click: () => tone(660, .04, "square", .02),
    route: () => [440, 660, 880].forEach((f, i) => tone(f, .08, "triangle", .05, i * .06)),
    coin: () => { tone(988, .07, "square", .04); tone(1319, .12, "square", .04, .07); },
    level: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .14, "square", .05, i * .08)),
    badge: () => [880, 1175, 1568].forEach((f, i) => tone(f, .1, "triangle", .05, i * .08)),
    sos: () => [880, 660, 880, 660].forEach((f, i) => tone(f, .12, "sawtooth", .03, i * .14)),
  };

  // sound toggle next to the theme button
  const btn = document.createElement("button"); btn.className = "nfx-sound"; btn.title = "Sound effects on/off";
  const paint = () => btn.textContent = muted ? "🔇" : "🔊"; paint();
  btn.onclick = () => { muted = !muted; store.set("nav-mute", muted ? "1" : "0"); paint(); SFX.coin(); };
  ($("#themeBtn") || $(".brand"))?.after(btn);

  document.addEventListener("pointerdown", e => { if (e.target.closest?.("button") && e.target !== btn) SFX.click(); });
  $("#help")?.addEventListener("click", () => SFX.sos());

  // route found -> chime (watch for route stat blocks appearing)
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType === 1 && n.classList?.contains("card") && n.querySelector(".big")) SFX.route();
  }))).observe($("#out"), { childList: true });

  // XP float -> coin + card bump
  const level = document.createElement("div"); level.id = "nfx-levelup"; document.body.appendChild(level);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType !== 1) return;
    if (n.classList.contains("xpfloat")) { SFX.coin(); const g = $("#game"); if (g) { g.classList.remove("bump"); void g.offsetWidth; g.classList.add("bump"); } }
  }))).observe(document.body, { childList: true });

  // toasts from game.js -> level-up overlay / badge sound
  const wait = setInterval(() => {
    const t = $(".toastx"); if (!t) return; clearInterval(wait);
    new MutationObserver(() => {
      if (!t.classList.contains("show")) return;
      const head = t.querySelector("b")?.textContent || "";
      if (/^Level \d+/.test(head)) {
        SFX.level(); level.innerHTML = `<div class="big2">LEVEL UP!<small>${head}</small></div>`;
        level.classList.remove("on"); void level.offsetWidth; level.classList.add("on");
      } else if (/Badge unlocked/.test(head)) SFX.badge();
    }).observe(t, { attributes: true, attributeFilter: ["class"] });
  }, 300);
  setTimeout(() => clearInterval(wait), 10000);

  // staggered pin drop on first load
  const pins = setInterval(() => {
    const els = document.querySelectorAll(".leaflet-marker-icon .emoji-pin"); if (!els.length) return;
    clearInterval(pins); els.forEach((el, i) => el.style.animationDelay = (i * 60) + "ms");
  }, 200);
  setTimeout(() => clearInterval(pins), 8000);
})();
