"""Run:  python -m pytest -q   (or: python tests/test_navigator.py)"""
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["GEMMA_PROVIDER"] = "none"

from navigator.engine import Campus  # noqa: E402
from navigator import nlu  # noqa: E402

C = Campus()


def test_graph_connected():
    ids = list(C.locations)
    for a in ids:
        for b in ids:
            assert C.route(a, b) is not None, f"no route {a}->{b}"


def test_accessible_avoids_stairs():
    r = C.route("central_library", "ab2", accessible=True)
    assert r and not r["uses_stairs"]
    f = C.route("central_library", "ab2")
    assert f["distance_m"] <= r["distance_m"]


def test_resolve():
    assert C.resolve("AB-III") == "ab3"
    assert C.resolve("the library") == "central_library"
    assert C.resolve("cse block") == "ab3"
    assert C.resolve("canteen 7") != "nonexistent"


def test_rooms():
    assert C.resolve_room("A-402")["location"] == "ab3"
    assert C.resolve_room("d102")["location"] == "ab2"
    assert C.resolve_room("Z-999") is None


def test_open_status():
    at = datetime(2026, 10, 8, 20, 0)
    assert C.open_status("it_canteen", at)["status"] == "closed"
    assert C.open_status("dispensary", at)["status"] == "open"
    assert C.open_status("ab1", at)["status"] == "unknown"


QUERIES = {
    "I have a class in Academic Block III. How do I get there from the library?": ("route", "ab3"),
    "take me from the library to CSE": ("route", "ab3"),
    "Is there a canteen nearby?": ("nearest", "it_canteen"),
    "I'm hungry. Where is the nearest canteen from Academic Block 2?": ("nearest", None),
    "Where is Canteen 7?": ("not_found", None),
    "where is block 9": ("not_found", None),
    "Where is A-402?": (None, "ab3"),
    "what's inside AB-II": ("info", "ab2"),
    "Medical emergency": ("emergency", "dispensary"),
    "give me an accessible route to academic block 2": ("route", "ab2"),
    "where is my next class": ("next_class", None),
    "I need a place to study that's open now": ("nearest", None),
    "where is the hogwarts tower": ("not_found", None),
}


def test_queries():
    for q, (intent, dest) in QUERIES.items():
        res = nlu.answer(q, C, origin="central_library")
        if intent:
            assert res["intent"] == intent, (q, res["intent"], res["reply"])
        if dest:
            assert res.get("destination") == dest, (q, res.get("destination"), res["reply"])


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
    for q in QUERIES:
        r = nlu.answer(q, C, origin="central_library")
        print(f"\n> {q}\n  [{r['intent']}] {r['reply']}")
