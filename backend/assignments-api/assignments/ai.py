"""Where Gemma 4 is used in the assignments side of CampusScope.

  1. quick_add  - turn one messy sentence into a structured assignment
                  ("dsa record due fri 9am in A-402, urgent")
  2. breakdown  - split an assignment into 3-6 concrete sub-tasks (checklist)
  3. plan       - order today's pending work into the student's real free slots

Pattern for every feature:  Gemma proposes  ->  our code validates  ->  fallback rules
if Gemma is offline / returns junk.  Gemma never writes dates, ids or slots
that our code has not checked.
"""
import re
from datetime import datetime, timedelta

from . import gemma
from .db import normalize_due

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
ROOM_RE = re.compile(r"\b([A-Za-z])\s*-?\s*(\d{3})\b")


def _room(v):
    m = ROOM_RE.search(str(v or ""))
    return f"{m.group(1).upper()}-{m.group(2)}" if m else ""


# ------------------------------------------------------------------ 1. quick add
def quick_add(text, courses, now=None):
    now = now or datetime.now()
    if gemma.enabled():
        try:
            data = _quick_add_gemma(text, courses, now)
            data["parser"] = gemma.label()
            return data
        except gemma.GemmaError as e:
            data = quick_add_rules(text, courses, now)
            data["parser"] = f"rules fallback ({str(e)[:60]})"
            return data
    data = quick_add_rules(text, courses, now)
    data["parser"] = "rules"
    return data


def _quick_add_gemma(text, courses, now):
    prompt = f"""You extract a student's assignment from one sentence. Return ONLY a JSON object.
Today is {now.strftime('%A %Y-%m-%d %H:%M')}.
Known courses: {', '.join(courses) or 'none'}

JSON schema:
{{"title": short task title (max 80 chars, no date words),
  "course": one of the known courses or "" if unclear,
  "due": "YYYY-MM-DDTHH:MM" resolved from words like tomorrow / friday / next week, or null if none given (use 23:59 when only a day is given),
  "priority": "low" | "medium" | "high"  (urgent, important, asap -> high),
  "room": room code like "A-402" if mentioned, else ""}}

Sentence: {text}
JSON:"""
    d = gemma.generate_json(prompt, temperature=0)
    if not isinstance(d, dict) or not str(d.get("title", "")).strip():
        raise gemma.GemmaError("no title")
    course = str(d.get("course") or "")
    match = next((c for c in courses if c.lower() == course.lower()), "")
    return {
        "title": str(d["title"]).strip()[:120],
        "course": match or _course_rules(text, courses),
        "due": normalize_due(d.get("due")) or _due_rules(text, now),
        "priority": d.get("priority") if d.get("priority") in ("low", "medium", "high") else "medium",
        "room": _room(d.get("room")) or _room(text),
    }


def _course_rules(text, courses):
    t = text.lower()
    for c in sorted(courses, key=len, reverse=True):
        initials = "".join(w[0] for w in re.findall(r"[A-Za-z]+", c)).lower()
        if c.lower() in t or (len(initials) >= 2 and re.search(rf"\b{initials}\b", t)):
            return c
    return ""


def _due_rules(text, now):
    t = text.lower()
    day = None
    if "today" in t or "tonight" in t:
        day = now
    elif "tomorrow" in t or "tmrw" in t:
        day = now + timedelta(days=1)
    elif "next week" in t:
        day = now + timedelta(days=7)
    else:
        for i, w in enumerate(WEEKDAYS):
            if re.search(rf"\b({w}|{w[:3]})\b", t):
                ahead = (i - now.weekday()) % 7 or 7
                day = now + timedelta(days=ahead)
                break
        m = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", t)
        if m:
            day = datetime.strptime(m.group(1), "%Y-%m-%d")
    if not day:
        return None
    h, mnt = 23, 59
    m = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", t)
    if m:
        h = int(m.group(1)) % 12 + (12 if m.group(3) == "pm" else 0)
        mnt = int(m.group(2) or 0)
    return day.replace(hour=h, minute=mnt).strftime("%Y-%m-%dT%H:%M")


def quick_add_rules(text, courses, now=None):
    now = now or datetime.now()
    t = text.lower()
    title = re.sub(r"\b(due|by|on|at|in)\b.*$", "", text, flags=re.I).strip(" ,.-") or text.strip()
    pr = "high" if re.search(r"\b(urgent|asap|important|high)\b", t) else "low" if re.search(r"\b(low|whenever|optional)\b", t) else "medium"
    return {"title": title[:120], "course": _course_rules(text, courses), "due": _due_rules(text, now),
            "priority": pr, "room": _room(text)}


# ------------------------------------------------------------------ 2. breakdown
TEMPLATES = {
    "record": ["Write aim and algorithm", "Run the code and capture outputs", "Write result / inference", "Get the record signed"],
    "report": ["Collect data and references", "Make the outline (sections)", "Write the first draft", "Add figures/tables", "Proof-read and submit"],
    "slides": ["Decide the story (5-7 key points)", "Make the slide outline", "Build slides with visuals", "Rehearse once with a timer"],
    "quiz": ["List the topics covered", "Revise notes for each topic", "Solve 10 practice questions", "Re-check weak topics"],
}


def breakdown(a):
    if gemma.enabled():
        try:
            prompt = f"""You help a first-year engineering student plan work. Split this assignment into 3 to 6
small, concrete sub-tasks, each doable in one sitting and starting with a verb. Return ONLY JSON:
{{"subtasks": ["...", "..."], "estimate_hours": number}}

Assignment: {a['title']}
Course: {a.get('course') or 'unknown'}
Due: {a.get('due') or 'not set'}
Notes: {a.get('notes') or '-'}
JSON:"""
            d = gemma.generate_json(prompt, temperature=0.3)
            subs = [str(s).strip()[:120] for s in (d.get("subtasks") or []) if str(s).strip()][:6]
            if len(subs) >= 2:
                est = d.get("estimate_hours")
                return {"subtasks": subs, "estimate_hours": est if isinstance(est, (int, float)) and 0 < est < 100 else None,
                        "parser": gemma.label()}
            raise gemma.GemmaError("too few subtasks")
        except gemma.GemmaError as e:
            return {**_breakdown_rules(a), "parser": f"rules fallback ({str(e)[:60]})"}
    return {**_breakdown_rules(a), "parser": "rules"}


def _breakdown_rules(a):
    t = (a["title"] + " " + (a.get("notes") or "")).lower()
    for k, steps in TEMPLATES.items():
        if k in t or (k == "slides" and ("ppt" in t or "presentation" in t)) or (k == "quiz" and "exam" in t):
            return {"subtasks": steps, "estimate_hours": None}
    return {"subtasks": ["Read the assignment brief carefully", "Do the main work", "Review and submit"], "estimate_hours": None}


# ------------------------------------------------------------------ 3. day plan
def free_slots(timetable, now=None, day_end="21:00", min_minutes=30):
    """Deterministic: gaps between now and day_end that are not covered by a class today."""
    now = now or datetime.now()
    end = now.replace(hour=int(day_end[:2]), minute=int(day_end[3:]), second=0, microsecond=0)
    busy = []
    for e in timetable:
        if int(e["day"]) != now.weekday():
            continue
        s = now.replace(hour=int(e["start"][:2]), minute=int(e["start"][3:5]), second=0, microsecond=0)
        f = now.replace(hour=int(e["end"][:2]), minute=int(e["end"][3:5]), second=0, microsecond=0)
        busy.append((s, f, e))
    busy.sort(key=lambda x: x[0])
    slots, cur = [], now.replace(second=0, microsecond=0)
    for s, f, _ in busy:
        if s > cur and (s - cur).seconds // 60 >= min_minutes:
            slots.append((cur, s))
        cur = max(cur, f)
    if end > cur and (end - cur).seconds // 60 >= min_minutes:
        slots.append((cur, end))
    return [{"index": i, "start": a.strftime("%H:%M"), "end": b.strftime("%H:%M"),
             "minutes": int((b - a).total_seconds() // 60)} for i, (a, b) in enumerate(slots)]


def urgency(a, now=None):
    now = now or datetime.now()
    score = {"high": 30, "medium": 15, "low": 0}.get(a.get("priority"), 15)
    if a.get("due"):
        hours = (datetime.strptime(a["due"], "%Y-%m-%dT%H:%M") - now).total_seconds() / 3600
        score += 100 if hours < 0 else max(0, 72 - hours)
    score += (100 - a.get("progress", 0)) / 10
    return round(score, 1)


def plan(assignments, timetable, now=None):
    now = now or datetime.now()
    pending = sorted([a for a in assignments if a["status"] != "done"], key=lambda a: -urgency(a, now))[:8]
    slots = free_slots(timetable, now)
    base = {"slots": slots, "generated_at": now.strftime("%H:%M")}
    if not pending or not slots:
        return {**base, "items": [], "tip": "Nothing pending or no free time left today.", "parser": "rules"}
    if gemma.enabled():
        try:
            return {**base, **_plan_gemma(pending, slots, now), "parser": gemma.label()}
        except gemma.GemmaError as e:
            return {**base, **_plan_rules(pending, slots, now), "parser": f"rules fallback ({str(e)[:60]})"}
    return {**base, **_plan_rules(pending, slots, now), "parser": "rules"}


def _plan_gemma(pending, slots, now):
    tasks = "\n".join(
        f'- id={a["id"]} | {a["title"]} | course={a.get("course") or "-"} | due={a.get("due") or "none"} | '
        f'priority={a["priority"]} | progress={a["progress"]}% | urgency={urgency(a, now)}' for a in pending)
    free = "\n".join(f'- slot {s["index"]}: {s["start"]}-{s["end"]} ({s["minutes"]} min)' for s in slots)
    prompt = f"""You are a study planner for a college student. Now: {now.strftime('%A %H:%M')}.
Assign the most important pending tasks to today's FREE slots. Only use the task ids and slot numbers given.
A slot may hold several tasks if their minutes fit. Skip tasks that do not fit. Overdue or due-soon first.

Pending tasks:
{tasks}

Free slots today:
{free}

Return ONLY JSON:
{{"items": [{{"id": task id, "slot": slot number, "minutes": minutes to spend, "why": "max 12 words"}}],
  "tip": "one short motivating sentence"}}
JSON:"""
    d = gemma.generate_json(prompt, temperature=0.2)
    ids = {a["id"]: a for a in pending}
    cap = {s["index"]: s["minutes"] for s in slots}
    items = []
    for it in d.get("items") or []:
        try:
            aid, slot, mins = str(it["id"]), int(it["slot"]), int(it.get("minutes") or 45)
        except (KeyError, ValueError, TypeError):
            continue
        if aid not in ids or slot not in cap or any(x["id"] == aid for x in items):
            continue
        mins = max(15, min(mins, cap[slot]))
        if mins <= 0 or cap[slot] < 15:
            continue
        cap[slot] -= mins
        items.append({"id": aid, "title": ids[aid]["title"], "slot": slot, "minutes": mins,
                      "why": str(it.get("why") or "")[:100]})
    if not items:
        raise gemma.GemmaError("plan had no valid items")
    return {"items": _times(items, slots), "tip": str(d.get("tip") or "")[:160]}


def _plan_rules(pending, slots, now):
    cap = {s["index"]: s["minutes"] for s in slots}
    items = []
    for a in pending:
        mins = 60 if a["priority"] == "high" else 45
        for s in slots:
            if cap[s["index"]] >= 30:
                m = min(mins, cap[s["index"]])
                cap[s["index"]] -= m
                why = "overdue" if a.get("due") and a["due"] < now.strftime("%Y-%m-%dT%H:%M") else f"{a['priority']} priority" + (f", due {a['due'][5:10]}" if a.get("due") else "")
                items.append({"id": a["id"], "title": a["title"], "slot": s["index"], "minutes": m, "why": why})
                break
    return {"items": _times(items, slots), "tip": "Most urgent first — tick sub-tasks as you go."}


def _times(items, slots):
    """Give each planned item a concrete start/end inside its slot."""
    cursor = {s["index"]: datetime.strptime(s["start"], "%H:%M") for s in slots}
    out = []
    for it in sorted(items, key=lambda x: x["slot"]):
        st = cursor[it["slot"]]
        en = st + timedelta(minutes=it["minutes"])
        cursor[it["slot"]] = en
        out.append({**it, "start": st.strftime("%H:%M"), "end": en.strftime("%H:%M")})
    return out
