# backend/assignments-api (BE-2)

Assignments, timetable, progress and the Gemma 4 study features. Python standard library + SQLite.

```bash
python run.py                          # http://localhost:8766
python tests/test_assignments.py       # tests (Gemma off, rules path)
```

| File | What |
|---|---|
| `assignments/db.py` | SQLite schema, CRUD, progress %, demo seed data |
| `assignments/gemma.py` | Gemma 4 client (Ollama / Google AI Studio), JSON extraction, health check |
| `assignments/ai.py` | **Gemma 4** quick-add, breakdown, day plan + rule fallbacks + free-slot maths |
| `assignments/server.py` | REST API, My Day (calls navigator-api for next class) |

Env: `GEMMA_PROVIDER`, `GEMMA_MODEL`, `OLLAMA_URL`, `GOOGLE_API_KEY`, `GEMMA_TIMEOUT`, `API_PORT`, `NAV_URL`, `ASSIGN_DB`.
The DB file `data/campusscope.db` is created on first run (delete it to reset the demo data).
