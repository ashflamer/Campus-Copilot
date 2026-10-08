"""Natural-language layer.

Gemma UNDERSTANDS the request (intent + places) -> the engine CALCULATES
(routing / nearest) -> the reply is built ONLY from engine facts
(optionally re-worded by Gemma, which is told to add nothing).

If Gemma is unreachable or returns junk, a keyword parser takes over, so the
demo never breaks.

Config (environment variables):
  GEMMA_PROVIDER = ollama | google | none      (default: ollama; falls back to keywords if unreachable)
  GEMMA_MODEL    = default gemma4:e4b (ollama) or gemma-4-31b-it (google AI Studio)
  OLLAMA_URL     = http://localhost:11434
  GOOGLE_API_KEY = your AI Studio key (for provider=google)
  GEMMA_EXPLAIN  = 1 to let Gemma re-word the final answer (facts only)
"""
import json
import os
import re
import urllib.request

PROVIDER = os.environ.get("GEMMA_PROVIDER", "ollama").lower()
MODEL = os.environ.get("GEMMA_MODEL", "gemma4:e4b" if PROVIDER == "ollama" else "gemma-4-31b-it")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
GOOGLE_KEY = os.environ.get("GOOGLE_API_KEY", "")
EXPLAIN = os.environ.get("GEMMA_EXPLAIN", "0") == "1"
TIMEOUT = float(os.environ.get("GEMMA_TIMEOUT", "15"))

INTENTS = ["route", "find_location", "nearest", "info", "next_class", "emergency", "unknown"]

EMERGENCY_RE = re.compile(r"\b(emergency|ambulance|injur\w*|bleed\w*|faint\w*|unconscious|accident|heart attack|help me|sos)\b")
NEXT_CLASS_RE = re.compile(r"\b(next class|my class|next lecture|my next|where is my class|class now)\b")
NEAREST_RE = re.compile(r"\b(nearest|closest|near|nearby|close by|hungry|where can i)\b")
ACCESS_RE = re.compile(r"\b(accessible|wheelchair|no stairs|without stairs|ramp|disabled|crutch\w*)\b")
OPEN_RE = re.compile(r"\b(open now|currently open|open right now|is .* open|that'?s open)\b")
INFO_RE = re.compile(r"\b(what'?s (in|inside|there)|what is (in|inside)|inside|departments? in|what does .* have)\b")
NUMBERED_PLACE_RE = re.compile(r"\b(canteen|block|hostel|library|gate|ground)\s*[- ]?\s*(\d+|[ivx]+)\b")


# ---------------------------------------------------------------- Gemma I/O
def _post(url, payload, headers=None):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **(headers or {})})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode())


def gemma_generate(prompt, want_json=True):
    if PROVIDER == "ollama":
        body = {"model": MODEL, "stream": False, "messages": [{"role": "user", "content": prompt}],
                "options": {"temperature": 0}}
        if want_json:
            body["format"] = "json"
        return _post(f"{OLLAMA_URL}/api/chat", body)["message"]["content"]
    if PROVIDER == "google":
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
        body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0}}
        res = _post(url, body, {"x-goog-api-key": GOOGLE_KEY})
        return res["candidates"][0]["content"]["parts"][0]["text"]
    raise RuntimeError("Gemma disabled")


def _extract_json(text):
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no JSON in model output")
    return json.loads(m.group(0))


def gemma_parse(text, campus):
    places = "\n".join(f'- {l["id"]}: {l["name"]} (also: {", ".join(l.get("aliases", [])[:6])})'
                       for l in campus.locations.values())
    prompt = f"""You are the intent parser for a campus navigation app. You never answer the user.
Return ONLY one JSON object, no prose.

Known places (use ONLY these ids):
{places}

Categories: food, medical, study, sports, security, store, hostel, admin, academic

JSON schema:
{{"intent": one of {INTENTS},
  "origin": place id or null,
  "destination": place id or null,
  "unknown_place": the place name the user asked for if it is NOT in the list, else null,
  "category": category or null,
  "room": room code like "A-402" or null,
  "accessible": true/false,
  "only_open": true/false}}

Rules:
- route = user wants to go somewhere / directions. find_location = "where is X".
- nearest = nearest/closest facility of a category. info = what is inside a place.
- next_class = asks about their next/upcoming class. emergency = medical or safety emergency.
- If the user names a place that is not in the list, set destination null and fill unknown_place.
- Never invent ids.

User: {text}
JSON:"""
    data = _extract_json(gemma_generate(prompt, want_json=True))
    if data.get("intent") not in INTENTS:
        data["intent"] = "unknown"
    for k in ("origin", "destination"):
        v = data.get(k)
        if v and v not in campus.locations:
            data[k] = campus.resolve(v)  # Gemma gave a name, map it to a real id or drop it
    if data.get("category") not in (None, "food", "medical", "study", "sports", "security", "store", "hostel", "admin", "academic"):
        data["category"] = campus.category_from_text(str(data["category"]))
    return data


# ------------------------------------------------------------ keyword parser
def _split_from_to(t):
    m = re.search(r"\bfrom (.+?) to (.+)$", t)
    if m:
        return m.group(1), m.group(2)
    m = re.search(r"\bto (.+?) from (.+)$", t)
    if m:
        return m.group(2), m.group(1)
    m = re.search(r"\bfrom (?:the )?([^,?.!]+)", t)
    if m:
        return m.group(1), None
    m = re.search(r"\b(?:i'?m|i am) (?:at|near|in) (.+?)(?:,|\.| and | how | where |$)", t)
    origin = m.group(1) if m else None
    return origin, None


def keyword_parse(text, campus):
    t = text.lower().strip()
    out = {"intent": "unknown", "origin": None, "destination": None, "unknown_place": None,
           "category": None, "room": campus.find_room_code(text), "accessible": bool(ACCESS_RE.search(t)),
           "only_open": bool(OPEN_RE.search(t))}

    if EMERGENCY_RE.search(t):
        out["intent"] = "emergency"
        return out

    origin_txt, dest_txt = _split_from_to(t)
    if origin_txt:
        out["origin"] = campus.resolve(origin_txt)
    if dest_txt:
        out["destination"] = campus.resolve(dest_txt)

    if NEXT_CLASS_RE.search(t):
        out["intent"] = "next_class"
        return out

    # numbered places like "canteen 7" / "block 5" must match exactly or be reported unknown
    for m in NUMBERED_PLACE_RE.finditer(t):
        phrase = re.sub(r"[\s-]+", " ", m.group(0)).strip()
        squashed = re.sub(r"[\s-]", "", t)
        known = any(
            phrase.replace(" ", "") in re.sub(r"[\s-]", "", k.lower()) and re.sub(r"[\s-]", "", k.lower()) in squashed
            for l in campus.locations.values() for k in l.get("aliases", []) + [l["name"]]
        )
        if not known:
            out["intent"] = "find_location"
            out["unknown_place"] = phrase
            return out

    if out["room"] and not out["destination"]:
        out["intent"] = "route"
        return out

    if NEAREST_RE.search(t) or out["only_open"]:
        cat = campus.category_from_text(t.replace(origin_txt or "@@", ""))
        if cat:
            out["intent"], out["category"] = "nearest", cat
            return out

    if not out["destination"]:
        rest = t.replace(origin_txt, " ") if origin_txt else t
        out["destination"] = campus.resolve(rest)

    if INFO_RE.search(t) and out["destination"]:
        out["intent"] = "info"
    elif out["destination"]:
        out["intent"] = "route" if re.search(r"\b(go|get|reach|take me|route|way|navigate|directions|how do i|walk)\b", t) or out["origin"] else "find_location"
    else:
        cat = campus.category_from_text(t)
        if cat and cat != "academic":
            out["intent"], out["category"] = "nearest", cat
        elif re.search(r"\b(where|go|take me|find|navigate|route)\b", t):
            out["intent"] = "find_location"
            m = re.search(r"\b(?:where is|where's|take me to|go to|find|navigate to|to)\s+(?:the\s+)?(.+?)\??$", t)
            out["unknown_place"] = (m.group(1) if m else text).strip()
    return out


def parse(text, campus):
    if PROVIDER in ("ollama", "google"):
        try:
            data = gemma_parse(text, campus)
            # keep deterministic safety nets from the keyword layer
            kw = keyword_parse(text, campus)
            if kw["intent"] == "emergency":
                data["intent"] = "emergency"
            if kw["room"] and not data.get("room"):
                data["room"] = kw["room"]
            data["parser"] = f"gemma ({MODEL})"
            return data
        except Exception as e:  # network down, bad JSON, no key...
            data = keyword_parse(text, campus)
            data["parser"] = f"keyword fallback ({type(e).__name__})"
            return data
    data = keyword_parse(text, campus)
    data["parser"] = "keyword"
    return data


# ------------------------------------------------------------------ answer
def _route_text(campus, r, dest_name):
    stairs = " Uses stairs." if r["uses_stairs"] else " Step-free ♿."
    via = " → ".join(s["via"] for s in r["steps"])
    return f"{dest_name}: {r['distance_m']} m, about {r['minutes']} min walk" + (f" via {via}." if via else ".") + stairs


def answer(text, campus, origin=None):
    """Full pipeline. origin = the start point currently selected in the UI."""
    p = parse(text, campus)
    origin = p.get("origin") or origin
    res = {"query": text, "parsed": p, "intent": p["intent"], "origin": origin}

    def not_found(name):
        res["intent"] = "not_found"
        res["reply"] = f"I couldn't find \"{name}\" in the CampusScope campus database."
        return res

    intent = p["intent"]

    if intent == "emergency":
        res["emergency"] = campus.emergency_info()
        r = campus.route(origin, "dispensary") if origin else None
        res["route"] = r
        res["destination"] = "dispensary"
        res["reply"] = ("🚨 Emergency: go to Amrita Dispensary (open 24/7 per official info)"
                        + (f" — {r['distance_m']} m, ~{r['minutes']} min." if r else ".")
                        + " Call the verified emergency contacts shown below.")
        return res

    if intent == "next_class":
        nc = campus.next_class()
        if not nc:
            res["reply"] = "No upcoming class found in the timetable."
            return res
        res["next_class"] = nc
        if not nc["location"]:
            res["reply"] = f"Next: {nc['course']} at {nc['start']} in room {nc['room']}, but I don't know which building that room is in yet."
            return res
        res["destination"] = nc["location"]
        when = "in progress now" if nc["in_progress"] else f"starts in {nc['starts_in_min']} min"
        floor = f", floor {nc['room_info']['floor']}" if nc["room_info"].get("floor") is not None else ""
        msg = f"Next class: {nc['course']} ({when}) — room {nc['room']}, {nc['room_info']['building']}{floor}."
        if origin:
            r = campus.route(origin, nc["location"], p.get("accessible"))
            res["route"] = r
            if r:
                msg += f" {r['distance_m']} m, ~{r['minutes']} min walk."
                if not nc["in_progress"] and r["minutes"] > nc["starts_in_min"]:
                    msg += " ⚠️ You may be late — leave now."
        res["reply"] = msg
        return res

    if intent == "nearest" and p.get("category"):
        places = campus.nearest(p["category"], origin, p.get("only_open"))
        if not places:
            res["reply"] = f"No {'open ' if p.get('only_open') else ''}{p['category']} places in the campus database."
            return res
        best = places[0]
        res["places"], res["destination"] = places, best["id"]
        if origin:
            res["route"] = campus.route(origin, best["id"], p.get("accessible"))
        dist = f" — {best['distance_m']} m, ~{best['minutes']} min" if "distance_m" in best else ""
        res["reply"] = f"Nearest {p['category']}: {best['name']}{dist}. {best['open']['label']}."
        if not origin:
            res["reply"] += " (Pick your starting point for walking distances.)"
        return res

    # room code -> building
    dest = p.get("destination")
    room = None
    if p.get("room") and not dest:
        room = campus.resolve_room(p["room"])
        if not room:
            return not_found(p["room"])
        dest = room["location"]
        res["room"] = room

    if not dest:
        if p.get("unknown_place"):
            return not_found(p["unknown_place"])
        res["intent"] = "unknown"
        res["reply"] = ("Try: \"take me from the library to AB-III\", \"nearest canteen\", "
                        "\"where is A-402\", \"what's inside AB-II\" or \"my next class\".")
        return res

    res["destination"] = dest
    info = campus.location_info(dest)
    room_txt = f"Room {room['room']} is in {room['building']}" + (f", floor {room['floor']}. " if room.get("floor") is not None else ". ") if room else ""

    if intent == "info":
        res["reply"] = f"{info['name']} has: {', '.join(info['inside'])}. {info['open']['label']}."
        return res

    if origin and origin != dest:
        r = campus.route(origin, dest, p.get("accessible"))
        if r is None and p.get("accessible"):
            res["reply"] = room_txt + f"No step-free route to {info['name']} is mapped yet."
            return res
        res["route"] = r
        res["intent"] = "route"
        res["reply"] = room_txt + _route_text(campus, r, info["name"])
        if p.get("accessible"):
            res["reply"] += " (accessible route)"
    else:
        res["reply"] = room_txt + f"{info['name']} — {', '.join(info['inside'])}. Pick your starting point to get a walking route."
    return res


def explain(res):
    """Optional: let Gemma re-word the reply using ONLY the facts we computed."""
    if not EXPLAIN or PROVIDER == "none" or res.get("intent") in ("emergency", "not_found"):
        return res
    try:
        prompt = ("Rewrite this campus navigation answer in 1-2 friendly sentences for a student. "
                  "Use ONLY the facts given. Do not add places, numbers, times or directions.\n\n"
                  f"Answer: {res['reply']}\nRewritten:")
        txt = gemma_generate(prompt, want_json=False).strip()
        if txt and len(txt) < 400:
            res["reply_raw"], res["reply"] = res["reply"], txt
    except Exception:
        pass
    return res
