/*  CampusScope ⇄ Navigator drop-in widget.
 *
 *  Add ONE line to any CampusScope page:
 *    <script src="http://localhost:8765/widget.js"></script>
 *
 *  You get:
 *   - a floating "🗺️ Campus" button that opens the Navigator in a panel
 *   - CampusNav.open({room:"A-402"})        open Navigator straight to a room
 *   - CampusNav.open({to:"ab3", from:"central_library"})
 *   - CampusNav.open({q:"nearest canteen"})
 *   - CampusNav.nextClassCard(element, entries, from)
 *       entries = [{day:0-6 (Mon=0), start:"HH:MM", end:"HH:MM", course:"...", room:"A-402"}, ...]
 *       renders "Your next class · 7 min walk · NAVIGATE" inside element
 *   - CampusNav.linkRooms(rootElement)  turns any [data-room="A-402"] element into a Navigate link
 */
(function () {
  const script = document.currentScript;
  const BASE = (script && script.dataset.nav) || (script ? new URL(script.src).origin : "http://localhost:8765");
  const BUTTON = !(script && script.dataset.button === "off");

  const css = `
  .cn-fab{position:fixed;left:18px;bottom:22px;z-index:99998;border:0;border-radius:99px;padding:12px 18px;
    background:#a4123f;color:#fff;font:600 15px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);cursor:pointer}
  .cn-modal{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center}
  .cn-modal.on{display:flex}
  .cn-box{width:min(1100px,96vw);height:min(760px,92vh);background:#fff;border-radius:18px;overflow:hidden;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.4)}
  .cn-box iframe{width:100%;height:100%;border:0}
  .cn-x{position:absolute;top:10px;right:60px;z-index:2;border:0;border-radius:99px;width:34px;height:34px;background:#1b1d1f;color:#fff;font-size:18px;cursor:pointer}
  .cn-card{font:14px/1.45 system-ui,sans-serif;border:1px solid #e3ded2;border-left:4px solid #a4123f;border-radius:14px;padding:14px;background:#fffdf8;color:#1b1d1f}
  .cn-card .k{font:600 11px system-ui;color:#a4123f;text-transform:uppercase;letter-spacing:.6px}
  .cn-card h4{margin:2px 0 4px;font-size:18px}
  .cn-card .m{color:#6b6f75;font-size:13px}
  .cn-card button,.cn-link{margin-top:10px;border:0;border-radius:10px;padding:8px 14px;background:#a4123f;color:#fff;font:600 13px system-ui;cursor:pointer}
  .cn-warn{color:#b3261e;font-weight:600}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  let modal, frame;
  function ensureModal() {
    if (modal) return;
    modal = document.createElement("div"); modal.className = "cn-modal";
    modal.innerHTML = '<div class="cn-box"><button class="cn-x" title="Close">×</button><iframe allow="geolocation; microphone"></iframe></div>';
    document.body.appendChild(modal);
    frame = modal.querySelector("iframe");
    modal.querySelector(".cn-x").onclick = close;
    modal.addEventListener("click", e => { if (e.target === modal) close(); });
  }
  function open(opts) {
    ensureModal();
    const p = new URLSearchParams({embed: "1"});
    Object.entries(opts || {}).forEach(([k, v]) => v != null && p.set(k, v === true ? "1" : v));
    frame.src = `${BASE}/?${p}`;
    modal.classList.add("on");
  }
  function close() { modal && modal.classList.remove("on"); }

  async function nextClassCard(el, entries, from) {
    if (typeof el === "string") el = document.querySelector(el);
    el.innerHTML = '<div class="cn-card"><span class="m">Loading next class…</span></div>';
    try {
      const r = await fetch(`${BASE}/api/next-class`, {method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({entries, from})});
      const d = await r.json();
      const n = d.next_class;
      if (!n) { el.innerHTML = '<div class="cn-card"><span class="m">No upcoming classes 🎉</span></div>'; return; }
      const walk = d.route ? `🚶 ${d.route.minutes} min · ${d.route.distance_m} m` : "";
      const late = d.route && !n.in_progress && d.route.minutes > n.starts_in_min ? '<div class="cn-warn">⚠️ Leave now — you may be late</div>' : "";
      const where = n.room_info ? `${n.room} · ${n.room_info.building}${n.room_info.floor != null ? " · floor " + n.room_info.floor : ""}` : `${n.room} · building unknown`;
      el.innerHTML = `<div class="cn-card"><div class="k">📍 Your next class</div><h4>${n.course}</h4>
        <div>${where}</div><div class="m">🕐 ${n.start} · ${n.in_progress ? "in progress" : "in " + n.starts_in_min + " min"} ${walk ? "· " + walk : ""}</div>${late}
        ${n.room_info ? "<button>NAVIGATE →</button>" : ""}</div>`;
      const b = el.querySelector("button");
      if (b) b.onclick = () => open({room: n.room, from});
    } catch (e) {
      el.innerHTML = `<div class="cn-card"><span class="m">Navigator offline (${e.message})</span></div>`;
    }
  }

  function linkRooms(root) {
    (root || document).querySelectorAll("[data-room]").forEach(n => {
      if (n.dataset.cnLinked) return;
      n.dataset.cnLinked = 1;
      const b = document.createElement("button");
      b.className = "cn-link"; b.textContent = "🗺️ Navigate";
      b.style.marginLeft = "8px"; b.style.marginTop = "0";
      b.onclick = e => { e.preventDefault(); open({room: n.dataset.room}); };
      n.appendChild(b);
    });
  }

  function init() {
    if (BUTTON) {
      const fab = document.createElement("button"); fab.className = "cn-fab"; fab.textContent = "🗺️ Campus";
      fab.onclick = () => open({}); document.body.appendChild(fab);
    }
    linkRooms();
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
  window.CampusNav = {open, close, nextClassCard, linkRooms, base: BASE};
})();
