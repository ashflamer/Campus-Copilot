# Architecture (current checkout)

CampusScope is a local demo assembled from a static browser UI, a Navigator HTTP server, and assignment-related Python modules. The repository describes a broader two-backend architecture, but the assignments HTTP server and the main workspace application module are **not present in this checkout**. The descriptions below distinguish working code from the documented/expected integration.

## Components that are present

```text
Browser
├── frontend/workspace-ui/index.html + css/app.css
│   └── js/config.js, js/api.js, js/util.js (partial workspace client)
└── frontend/navigator-ui (map, search, route UI, bundled Leaflet)
             │
             ├── Navigator API: backend/navigator-api/navigator/server.py (:8765 by default)
             │      ├── navigator/engine.py: JSON-backed data, graph, Dijkstra, room/hour/timetable lookups
             │      ├── navigator/nlu.py: Gemma request parsing + keyword fallback + deterministic answers
             │      └── data/*.json
             │
             └── Assignment support modules: backend/assignments-api/assignments/
                    ├── db.py: SQLite assignment/timetable persistence and demo seed
                    └── gemma.py: optional Gemma HTTP client
                    (no assignments API server is present in this checkout)
```

### Navigator

`backend/navigator-api/run.py` starts the standard-library `ThreadingHTTPServer` on `0.0.0.0`, port `NAV_PORT` (default `8765`). The same process serves JSON routes and static files from `frontend/navigator-ui` (or `NAV_STATIC_DIR`). The browser UI uses Leaflet 1.9.4 from the checked-in `vendor/leaflet` copy; it has CDN fallbacks in the page. Map tiles are requested from OpenStreetMap and require a network connection.

The Navigator engine loads locations, path graph, room mappings, emergency contacts, and a demonstration timetable from JSON. It computes path lengths from coordinates using the haversine formula and uses Dijkstra for paths. Accessible routing omits edges marked as stairs. “Open now” is calculated from the limited hours values in the JSON; it is not a live campus-hours service. NLU uses Gemma when configured, but deterministic rules build answers from known data and a keyword parser is used when the model fails or is disabled. Gemma output is not the source of campus facts.

The pin editor can write changed coordinates into the tracked data JSON files. It is enabled by default (`NAV_EDITOR=1`) and has no authentication; only use it in a trusted local demo environment.

### Workspace and assignment support

`frontend/workspace-ui/index.html` provides Board, My Day, and Timetable markup, and references `js/app.js`. That module is absent in this checkout, so the complete workspace page behavior is not available here. `js/api.js` expresses the browser client's expected assignments API calls, but there is no HTTP server/route implementation under `backend/assignments-api` in this checkout. Do not treat those client calls as a running API.

`assignments/db.py` is a SQLite storage module for assignments and timetable rows. It seeds local demo records and can copy the Navigator demo timetable on first initialization. `assignments/gemma.py` is a separate optional Gemma client with a request timeout and JSON parsing helper. Neither module is wired to an assignments HTTP server in the current files.

## Model and data flow

The intended safety boundary is **“Gemma understands → our code calculates → known data answers.”** In the Navigator, the request parser may call Gemma to classify intent and identify known place IDs. The engine resolves only loaded locations, calculates routes and distances, and constructs replies from its JSON database. An optional explanation call can reword the computed answer. Requests have timeouts and parser/answer paths fall back to rules; model text should not be treated as verified facts.

The assignments Gemma helper supports Ollama, Google AI Studio, and disabled (`none`) configuration. The assignments service that would call it is absent, so no claim is made here about end-to-end assignment AI behavior.

## Local ports and configuration

- Navigator API and static Navigator UI: `NAV_PORT`, default `8765`.
- Assignment API port: `.env.example` documents `API_PORT=8766`, but no server binding that port exists in this checkout.
- Workspace static server: `frontend/workspace-ui/serve.py`, `UI_PORT` default `5173`; it serves static files only and has no API proxy.
- Model client settings: `GEMMA_PROVIDER`, `GEMMA_MODEL`, `OLLAMA_URL`, `GOOGLE_API_KEY`, and `GEMMA_TIMEOUT`; Navigator also reads `GEMMA_EXPLAIN`.

Browser client configuration currently defaults to direct same-host ports `8766` and `8765`, with optional `?api=` / `?nav=` overrides persisted in local storage. No reverse proxy or same-origin API proxy is implemented by the current workspace server.

## Demo status and limitations

This is not a production deployment. There is no production authentication, shared student identity, hosting decision, or verified live campus dataset. The committed Navigator coordinates, paths, room-prefix mappings, many hours, and timetable are demo data and include explicit approximations/placeholders. Check `docs/NAVIGATOR.md` before relying on any map or campus information. The database uses a local SQLite file and demo seed data. Keep real personal, sensitive, and credential data out of this demo.
