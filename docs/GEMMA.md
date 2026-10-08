# Where and why CampusScope uses Gemma 4

**Model:** Gemma 4 (`gemma4:e4b` by default via Ollama, runs fully on a student laptop; `gemma4:e2b` for low-RAM machines; any Gemma 4 model on Google AI Studio with `GEMMA_PROVIDER=google`).
**Licence:** Gemma 4 weights are Apache 2.0, downloaded by the user, not stored in this repo.

## Why Gemma 4 and not a cloud LLM

1. **Runs locally and offline.** Campus Wi-Fi is patchy; E4B runs on a normal laptop through Ollama, so the assistant works in a classroom with no internet.
2. **Student data stays on the device.** Assignments and timetables never leave the laptop.
3. **Zero cost per request.** Every student can run it; no API key or billing.
4. **Good at structured JSON.** All four of our prompts ask for one JSON object, which small Gemma 4 models produce reliably with Ollama's `format: "json"`.
5. **Multilingual (future).** Gemma 4 handles Indian languages, so the same prompts can accept Tamil/Malayalam queries next.

## The rule: Gemma understands → code calculates → verified data answers

Gemma is **never** allowed to be the source of truth. It turns messy human language into structured data; deterministic code checks that data against the database and does the maths. If Gemma is offline, slow (`GEMMA_TIMEOUT`) or returns bad JSON, a rule-based fallback runs and the UI shows which one answered (`understood by: gemma (gemma4:e4b)` vs `rules fallback`).

## The 5 places Gemma 4 is used

| # | Feature | File / function | Gemma input → output | What our code validates / does |
|---|---|---|---|---|
| 1 | **Navigator intent parsing** | `backend/navigator-api/navigator/nlu.py` → `gemma_parse()` | user sentence + list of real campus place ids → `{intent, origin, destination, unknown_place, category, room, accessible, only_open}` | ids must exist in `locations.json` (else mapped via aliases or dropped); unknown places produce *"I couldn't find X"*; emergency keywords always force the SOS path; Dijkstra computes the route |
| 2 | **Answer re-wording** (optional, `GEMMA_EXPLAIN=1`) | `nlu.py` → `explain()` | computed answer text → friendlier 1–2 sentences | told to add no facts; skipped for emergency and not-found replies; length-capped |
| 3 | **Quick add** | `backend/assignments-api/assignments/ai.py` → `_quick_add_gemma()` | one sentence + today's date + known courses → `{title, course, due, priority, room}` | course must match a known course; due must parse as `YYYY-MM-DDTHH:MM` (else rules date parser); room normalised to `A-402` format; priority whitelisted |
| 4 | **Break down** | `ai.py` → `breakdown()` | assignment title/course/due/notes → `{subtasks[3-6], estimate_hours}` | trimmed, max 6, needs ≥ 2; already-done steps are kept; estimate range-checked |
| 5 | **Plan my day** | `ai.py` → `_plan_gemma()` | pending tasks (with ids, urgency score) + **free slots computed by our code** → `{items:[{id, slot, minutes, why}], tip}` | unknown ids/slots dropped; minutes clipped to slot capacity; duplicates removed; start/end times computed by code, not Gemma |

## Why this is "meaningful" use (not a chatbot bolted on)

- Without Gemma, quick-add needs a rigid form and the navigator needs exact phrases. With Gemma, *"I've got AI lab in A-402 at 11, how do I get there from the canteen without stairs?"* just works.
- Gemma handles the **language**; the parts that must be correct (routes, distances, dates, free time) are computed. This gives the flexibility of an LLM with zero hallucinated rooms or routes, which matters when a student is late for class or in an emergency.

## Prompts

All prompts live in code next to the feature (search for `prompt = f"""`). Each one:
- states the exact JSON schema,
- lists the only allowed ids/values,
- runs at temperature 0–0.3,
- is followed by validation + fallback.

## Switching models

```bash
GEMMA_MODEL=gemma4:e2b python run.py                                  # smaller, faster
GEMMA_PROVIDER=google GEMMA_MODEL=gemma-4-31b-it GOOGLE_API_KEY=... python run.py   # AI Studio
GEMMA_PROVIDER=none python run.py                                      # rules only (for comparison)
OLLAMA_URL=http://192.168.1.20:11434 python run.py                    # share one laptop's Gemma
```

Check what is connected: `GET http://localhost:8766/api/ai/status`.
