"""Campus Navigator engine: campus database, graph routing (Dijkstra), search,
nearest facility, open-now status, room resolution and next-class lookup.

Pure standard library. Everything geographic comes from data/*.json —
nothing here guesses or invents a location.
"""
import heapq
import json
import math
import re
from datetime import datetime, timedelta
from pathlib import Path

try:
    from zoneinfo import ZoneInfo
    TZ = ZoneInfo("Asia/Kolkata")
except Exception:  # pragma: no cover - very old Python / no tzdata
    TZ = None

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
WALK_SPEED_MPS = 1.3  # average walking speed

CATEGORY_WORDS = {
    "food": ["food", "canteen", "eat", "hungry", "lunch", "breakfast", "dinner", "snack", "tea", "coffee", "mess"],
    "medical": ["medical", "doctor", "clinic", "dispensary", "sick", "hospital", "pharmacy", "first aid", "injury", "fever"],
    "study": ["study", "library", "read", "books"],
    "sports": ["sports", "ground", "play", "gym", "pool", "swim", "football", "cricket"],
    "security": ["security", "guard", "lost", "police"],
    "store": ["store", "shop", "stationery", "print", "printing", "xerox", "photocopy", "atm", "cash"],
    "hostel": ["hostel", "room", "dorm"],
    "admin": ["admin", "office", "administration", "fees", "document"],
    "academic": ["academic", "block", "class", "lecture", "department"],
}


def now_local():
    return datetime.now(TZ) if TZ else datetime.now()


def haversine(a_lat, a_lng, b_lat, b_lng):
    r = 6371000.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def norm(text):
    text = (text or "").lower()
    text = re.sub(r"[^a-z0-9\- ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def walk_minutes(meters):
    if meters < 15:
        return 0
    return max(1, round(meters / WALK_SPEED_MPS / 60))


class Campus:
    def __init__(self, data_dir=DATA_DIR):
        self.data_dir = Path(data_dir)
        self.reload()

    # ------------------------------------------------------------------ load
    def _load(self, name):
        with open(self.data_dir / name, encoding="utf-8") as f:
            return json.load(f)

    def reload(self):
        loc = self._load("locations.json")
        self.campus = loc["campus"]
        self.locations = {l["id"]: l for l in loc["locations"]}
        self.graph_data = self._load("graph.json")
        self.rooms = self._load("rooms.json")
        self.emergency = self._load("emergency.json")["contacts"]
        self.timetable = self._load("timetable.json")["entries"]
        self._build_graph()

    def _build_graph(self):
        self.nodes = {}  # id -> (lat, lng, label)
        for nid, n in self.graph_data["nodes"].items():
            self.nodes[nid] = (n["lat"], n["lng"], n.get("label", nid))
        for lid, l in self.locations.items():
            self.nodes[lid] = (l["lat"], l["lng"], l["name"])
        self.adj = {nid: [] for nid in self.nodes}

        def add(a, b, stairs=False, covered=False, name="", connector=False):
            if a not in self.nodes or b not in self.nodes:
                raise ValueError(f"Edge references unknown node: {a} -> {b}")
            d = haversine(*self.nodes[a][:2], *self.nodes[b][:2])
            e = {"dist": d, "stairs": stairs, "covered": covered, "name": name, "connector": connector}
            self.adj[a].append((b, e))
            self.adj[b].append((a, e))

        for e in self.graph_data["edges"]:
            add(e["from"], e["to"], e.get("stairs", False), e.get("covered", False), e.get("name", ""))
        for lid, l in self.locations.items():
            add(lid, l["node"], False, False, f"to {l['name']}", connector=True)

    # ------------------------------------------------------------- routing
    def route(self, origin, destination, accessible=False):
        """Dijkstra shortest path. accessible=True skips any edge with stairs."""
        if origin not in self.nodes or destination not in self.nodes:
            return None
        dist = {origin: 0.0}
        prev = {}
        pq = [(0.0, origin)]
        while pq:
            d, u = heapq.heappop(pq)
            if u == destination:
                break
            if d > dist.get(u, math.inf):
                continue
            for v, e in self.adj[u]:
                if accessible and e["stairs"]:
                    continue
                nd = d + e["dist"]
                if nd < dist.get(v, math.inf):
                    dist[v], prev[v] = nd, (u, e)
                    heapq.heappush(pq, (nd, v))
        if destination not in dist:
            return None

        path, edges, cur = [destination], [], destination
        while cur != origin:
            p, e = prev[cur]
            edges.append(e)
            path.append(p)
            cur = p
        path.reverse()
        edges.reverse()

        steps, carry = [], 0.0
        for e, to in zip(edges, path[1:]):
            if e.get("connector"):  # short building-to-junction link: fold its length into a real step
                if steps:
                    steps[-1]["meters"] += e["dist"]
                else:
                    carry += e["dist"]
                continue
            label = e["name"] or "path"
            e = {**e, "dist": e["dist"] + carry}
            carry = 0.0
            if steps and steps[-1]["via"] == label:
                steps[-1]["meters"] += e["dist"]
                steps[-1]["to"] = self.nodes[to][2]
            else:
                steps.append({"via": label, "to": self.nodes[to][2], "meters": e["dist"],
                              "stairs": e["stairs"], "covered": e["covered"]})
        for s in steps:
            s["meters"] = round(s["meters"])

        meters = dist[destination]
        return {
            "origin": origin,
            "destination": destination,
            "accessible": accessible,
            "distance_m": round(meters),
            "minutes": walk_minutes(meters),
            "uses_stairs": any(e["stairs"] for e in edges),
            "polyline": [[self.nodes[n][0], self.nodes[n][1]] for n in path],
            "path": path,
            "steps": steps,
        }

    def route_options(self, origin, destination):
        fastest = self.route(origin, destination, accessible=False)
        acc = self.route(origin, destination, accessible=True)
        if not fastest:
            return None
        out = {"fastest": fastest}
        if acc and acc["path"] != fastest["path"]:
            out["accessible"] = acc
        elif acc:
            fastest["accessible_ok"] = True
        else:
            fastest["accessible_unavailable"] = True
        return out

    # -------------------------------------------------------------- search
    def resolve(self, text):
        """Map free text to a location id using id / name / aliases.
        Returns None when nothing matches — never guesses."""
        q = norm(text)
        if not q:
            return None
        q = q.replace("the ", "")
        best, best_len = None, 0
        for lid, l in self.locations.items():
            keys = {norm(lid), norm(l["name"])} | {norm(a) for a in l.get("aliases", [])}
            for k in keys:
                if not k:
                    continue
                if q == k:
                    return lid
                if re.search(r"(^|\s)" + re.escape(k) + r"($|\s)", q) and len(k) > best_len:
                    best, best_len = lid, len(k)
        return best

    def search(self, text, limit=8):
        q = norm(text)
        if not q:
            return []
        hits = []
        for l in self.locations.values():
            hay = " ".join([l["name"], l["type"], l["category"], *l.get("aliases", []), *l.get("inside", [])]).lower()
            if q in hay:
                score = 0 if q in l["name"].lower() else 1
                hits.append((score, l["name"], l["id"]))
        hits.sort()
        return [self.location_info(h[2]) for h in hits[:limit]]

    def category_from_text(self, text):
        q = norm(text)
        for cat, words in CATEGORY_WORDS.items():
            if any(re.search(r"(^|\s)" + re.escape(w), q) for w in words):
                return cat
        return None

    # ------------------------------------------------------------ hours
    def open_status(self, lid, at=None):
        l = self.locations[lid]
        hours = l.get("hours")
        if not hours:
            return {"status": "unknown", "label": "Hours not verified"}
        if hours == "24h":
            return {"status": "open", "label": "Open 24/7" + (" (officially listed)" if l.get("hours_note") else "")}
        try:
            start, end = hours.split("-")
            at = at or now_local()
            t = at.strftime("%H:%M")
            is_open = start <= t < end
        except ValueError:
            return {"status": "unknown", "label": "Hours not verified"}
        label = f"{'Open' if is_open else 'Closed'} · {start}–{end}"
        if l.get("hours_note"):
            label += " (officially listed)"
        return {"status": "open" if is_open else "closed", "label": label}

    def location_info(self, lid):
        l = self.locations.get(lid)
        if not l:
            return None
        info = {k: l.get(k) for k in ("id", "name", "type", "category", "lat", "lng", "inside", "hours", "verified")}
        info["open"] = self.open_status(lid)
        return info

    def nearest(self, category, origin=None, only_open=False, limit=3):
        cands = [l for l in self.locations.values() if l["category"] == category]
        out = []
        for l in cands:
            info = self.location_info(l["id"])
            if only_open and info["open"]["status"] == "closed":
                continue
            if origin and origin in self.nodes:
                r = self.route(origin, l["id"])
                if not r:
                    continue
                info["distance_m"], info["minutes"] = r["distance_m"], r["minutes"]
            out.append(info)
        if origin:
            out.sort(key=lambda x: x.get("distance_m", 1e9))
        return out[:limit]

    # ------------------------------------------------------------ rooms
    ROOM_RE = re.compile(r"\b([A-Za-z])\s*-?\s*(\d{3})\b")

    def find_room_code(self, text):
        m = self.ROOM_RE.search(text or "")
        return f"{m.group(1).upper()}-{m.group(2)}" if m else None

    def resolve_room(self, code):
        code = self.find_room_code(code) or (code or "").upper()
        if not code:
            return None
        if code in self.rooms["rooms"]:
            r = dict(self.rooms["rooms"][code])
        else:
            prefix = code.split("-")[0]
            rule = next((p for p in self.rooms["prefix_rules"] if p["prefix"] == prefix), None)
            if not rule:
                return None
            r = {"location": rule["location"]}
            num = code.split("-")[1] if "-" in code else ""
            if num[:1].isdigit():
                r["floor"] = int(num[0])
        if r["location"] not in self.locations:
            return None
        r["room"] = code
        r["building"] = self.locations[r["location"]]["name"]
        return r

    # --------------------------------------------------------- timetable
    def next_class(self, entries=None, at=None):
        entries = entries if entries is not None else self.timetable
        at = at or now_local()
        for offset in range(0, 8):
            day = at + timedelta(days=offset)
            todays = sorted((e for e in entries if e["day"] == day.weekday()), key=lambda e: e["start"])
            for e in todays:
                if offset == 0 and e.get("end", e["start"]) <= at.strftime("%H:%M"):
                    continue
                start_dt = day.replace(hour=int(e["start"][:2]), minute=int(e["start"][3:]), second=0, microsecond=0)
                mins = int((start_dt - at).total_seconds() // 60)
                room = self.resolve_room(e["room"])
                return {**e, "starts_in_min": mins, "in_progress": mins < 0,
                        "room_info": room, "location": room["location"] if room else None}
        return None

    def emergency_info(self):
        out = []
        for c in self.emergency:
            c = dict(c)
            if c.get("location") in self.locations:
                c["lat"], c["lng"] = self.locations[c["location"]]["lat"], self.locations[c["location"]]["lng"]
            out.append(c)
        return out
