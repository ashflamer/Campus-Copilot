"""Run:  python tests/test_assignments.py   (or: python -m pytest -q)"""
import os
import sys
import tempfile
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["GEMMA_PROVIDER"] = "none"
os.environ["ASSIGN_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")

from assignments import ai, db  # noqa: E402

NOW = datetime(2026, 10, 8, 11, 0)  # Thursday
COURSES = ["AI Lab", "MIS-1", "Elements of Computing", "Computational Mechanics"]


def test_seed_and_crud():
    assert len(db.list_assignments()) >= 4
    a = db.create({"title": "Test task", "due": "2026-10-10", "priority": "high"})
    assert a["due"] == "2026-10-10T23:59" and a["progress"] == 0
    a = db.update(a["id"], {"subtasks": [{"text": "x", "done": True}, {"text": "y"}]})
    assert a["progress"] == 50
    assert db.delete(a["id"]) and db.get(a["id"]) is None


def test_quick_add_rules():
    p = ai.quick_add("MIS-1 regression report due friday 5pm in D-102 urgent", COURSES, NOW)
    assert p["course"] == "MIS-1" and p["room"] == "D-102" and p["priority"] == "high"
    assert p["due"] == "2026-10-09T17:00", p["due"]
    p = ai.quick_add("AI Lab record tomorrow", COURSES, NOW)
    assert p["course"] == "AI Lab" and p["due"].startswith("2026-10-09")


def test_breakdown_rules():
    r = ai.breakdown({"title": "AI Lab record", "notes": ""})
    assert len(r["subtasks"]) >= 3


def test_free_slots_skip_classes():
    tt = [{"day": 3, "start": "11:00", "end": "11:50"}, {"day": 3, "start": "14:00", "end": "14:50"}]
    slots = ai.free_slots(tt, datetime(2026, 10, 8, 10, 0))
    assert [s["start"] for s in slots] == ["10:00", "11:50", "14:50"]


def test_plan_rules_valid():
    p = ai.plan(db.list_assignments(), db.get_timetable(), NOW)
    ids = {a["id"] for a in db.list_assignments()}
    assert all(i["id"] in ids for i in p["items"])


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok ", name)
    print("all assignment tests passed")
