"""SQLite storage for assignments + timetable (standard library only)."""
import json
import os
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(os.environ.get("ASSIGN_DB", Path(__file__).resolve().parent.parent / "data" / "campusscope.db"))
_lock = threading.Lock()

STATUSES = ("todo", "doing", "done")
PRIORITIES = ("low", "medium", "high")
FIELDS = ("title", "course", "due", "priority", "status", "room", "notes", "subtasks")

SCHEMA = """
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  course TEXT DEFAULT '',
  due TEXT,                      -- ISO 'YYYY-MM-DDTHH:MM' local time, or NULL
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'todo',
  room TEXT DEFAULT '',          -- room code like A-402, links to the Navigator
  notes TEXT DEFAULT '',
  subtasks TEXT DEFAULT '[]',    -- JSON [{"text":..., "done":bool}]
  source TEXT DEFAULT 'manual',  -- manual | gemma | rules
  created REAL,
  updated REAL
);
CREATE TABLE IF NOT EXISTS timetable (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day INTEGER, start TEXT, "end" TEXT, course TEXT, room TEXT
);
"""


def _conn():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


_c = None


def conn():
    global _c
    if _c is None:
        _c = _conn()
        _c.executescript(SCHEMA)
        _seed(_c)
    return _c


def _row(r):
    d = dict(r)
    d["subtasks"] = json.loads(d.get("subtasks") or "[]")
    st = d["subtasks"]
    if d["status"] == "done":
        d["progress"] = 100
    elif st:
        d["progress"] = round(100 * sum(1 for s in st if s.get("done")) / len(st))
    else:
        d["progress"] = 50 if d["status"] == "doing" else 0
    return d


def _clean(data, partial=False):
    out = {}
    for k in FIELDS:
        if k not in data:
            continue
        v = data[k]
        if k == "subtasks":
            v = json.dumps([{"text": str(s.get("text", ""))[:200], "done": bool(s.get("done"))}
                            for s in (v or []) if isinstance(s, dict) and s.get("text")])
        elif k == "priority":
            v = v if v in PRIORITIES else "medium"
        elif k == "status":
            v = v if v in STATUSES else "todo"
        elif k == "due":
            v = normalize_due(v)
        else:
            v = ("" if v is None else str(v))[:2000]
        out[k] = v
    if not partial and not out.get("title"):
        raise ValueError("title is required")
    return out


def normalize_due(v):
    if not v:
        return None
    s = str(v).strip().replace(" ", "T")
    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            d = datetime.strptime(s[:len(datetime.now().strftime(fmt))], fmt)
            if fmt == "%Y-%m-%d":
                d = d.replace(hour=23, minute=59)
            return d.strftime("%Y-%m-%dT%H:%M")
        except ValueError:
            continue
    return None


def list_assignments():
    with _lock:
        rows = conn().execute("SELECT * FROM assignments ORDER BY (due IS NULL), due, created").fetchall()
    return [_row(r) for r in rows]


def get(aid):
    with _lock:
        r = conn().execute("SELECT * FROM assignments WHERE id=?", (aid,)).fetchone()
    return _row(r) if r else None


def create(data, source="manual"):
    d = _clean(data)
    d.setdefault("status", "todo")
    d.setdefault("priority", "medium")
    aid = uuid.uuid4().hex[:10]
    now = time.time()
    cols = ["id", "source", "created", "updated"] + list(d)
    with _lock:
        conn().execute(f"INSERT INTO assignments ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})",
                       [aid, source, now, now] + list(d.values()))
        conn().commit()
    return get(aid)


def update(aid, data):
    d = _clean(data, partial=True)
    if not d:
        return get(aid)
    with _lock:
        conn().execute(f"UPDATE assignments SET {', '.join(k + '=?' for k in d)}, updated=? WHERE id=?",
                       list(d.values()) + [time.time(), aid])
        conn().commit()
    return get(aid)


def delete(aid):
    with _lock:
        n = conn().execute("DELETE FROM assignments WHERE id=?", (aid,)).rowcount
        conn().commit()
    return n > 0


def get_timetable():
    with _lock:
        rows = conn().execute('SELECT day, start, "end", course, room FROM timetable ORDER BY day, start').fetchall()
    return [dict(r) for r in rows]


def set_timetable(entries):
    clean = []
    for e in entries:
        try:
            clean.append((int(e["day"]) % 7, str(e["start"])[:5], str(e.get("end") or e["start"])[:5],
                          str(e.get("course", ""))[:120], str(e.get("room", ""))[:20]))
        except (KeyError, ValueError, TypeError):
            continue
    with _lock:
        c = conn()
        c.execute("DELETE FROM timetable")
        c.executemany('INSERT INTO timetable (day, start, "end", course, room) VALUES (?,?,?,?,?)', clean)
        c.commit()
    return get_timetable()


def _seed(c):
    if c.execute("SELECT COUNT(*) FROM assignments").fetchone()[0]:
        return
    today = datetime.now().replace(second=0, microsecond=0)

    def at(days, h=23, m=59):
        return (today + timedelta(days=days)).replace(hour=h, minute=m).strftime("%Y-%m-%dT%H:%M")

    demo = [
        ("AI Lab record — experiments 4 & 5", "AI Lab", at(1, 9, 0), "high", "doing", "A-402",
         [{"text": "Write aim + algorithm for exp 4", "done": True}, {"text": "Run code & paste outputs", "done": False},
          {"text": "Get record signed", "done": False}]),
        ("MIS-1 regression report", "MIS-1", at(3), "high", "todo", "D-102", []),
        ("Computational Mechanics pipe-flow slides", "Computational Mechanics", at(5, 17, 0), "medium", "todo", "C-305", []),
        ("Elements of Computing quiz prep", "Elements of Computing", at(2, 10, 0), "medium", "todo", "B-201", []),
        ("Computational Thinking worksheet 3", "Computational Thinking", at(-1, 18, 0), "low", "done", "D-102", []),
    ]
    now = time.time()
    for t, course, due, pr, st, room, subs in demo:
        c.execute("INSERT INTO assignments (id,title,course,due,priority,status,room,notes,subtasks,source,created,updated) "
                  "VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                  (uuid.uuid4().hex[:10], t, course, due, pr, st, room, "", json.dumps(subs), "seed", now, now))
    tt = Path(__file__).resolve().parents[2] / "navigator-api" / "data" / "timetable.json"
    entries = json.loads(tt.read_text(encoding="utf-8"))["entries"] if tt.exists() else []
    c.executemany('INSERT INTO timetable (day, start, "end", course, room) VALUES (?,?,?,?,?)',
                  [(e["day"], e["start"], e["end"], e["course"], e["room"]) for e in entries])
    c.commit()
