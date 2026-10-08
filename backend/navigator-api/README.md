# backend/navigator-api (BE-1)

Campus graph + Dijkstra routing + Gemma 4 natural-language understanding. Python standard library only.

```bash
python run.py                         # http://localhost:8765 (API + serves frontend/navigator-ui)
python tests/test_navigator.py        # tests + demo queries
```

| File | What |
|---|---|
| `navigator/engine.py` | graph, haversine distances, Dijkstra, step-free routing, nearest, open-now, room → building, next class |
| `navigator/nlu.py` | **Gemma 4** intent parser (JSON), keyword fallback, answer builder, optional Gemma re-wording |
| `navigator/server.py` | REST API + static files |
| `data/*.json` | the campus database (see docs/NAVIGATOR.md) |

Env: `GEMMA_PROVIDER` (ollama), `GEMMA_MODEL` (gemma4:e4b), `OLLAMA_URL`, `GEMMA_EXPLAIN`, `NAV_PORT`, `NAV_STATIC_DIR`, `NAV_EDITOR`.
