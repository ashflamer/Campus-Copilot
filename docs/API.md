# API reference (current checkout)

This reference covers the HTTP handlers actually present in `backend/navigator-api/navigator/server.py`. JSON responses use UTF-8. The server sets permissive `Access-Control-Allow-Origin: *`; this is a local/demo API, not an authenticated production service. Unless otherwise noted, an error response has the form `{"error":"message"}`.

## Navigator server

Start from `backend/navigator-api` with `python run.py`. Default bind is `0.0.0.0:8765` (`NAV_HOST`, `NAV_PORT` can override it). The same server serves `frontend/navigator-ui` static assets.

### GET endpoints

| Path | Query parameters | Behavior |
|---|---|---|
| `/api/health` | — | Returns `{ok, ai, model}` for the running handler/configuration. This is a basic process response, not a readiness or production-health guarantee. |
| `/api/campus` | — | Returns campus metadata, loaded location records with computed `open` status, non-location graph nodes, graph edges, emergency contacts, and configured AI provider/model. |
| `/api/route` | `from`, `to`, optional `accessible` | Computes a Dijkstra path. `accessible` accepts `1`, `true`, `yes`, or `on`; marked stair edges are excluded when true. Returns route details (`origin`, `destination`, `distance_m`, `minutes`, `uses_stairs`, `polyline`, `path`, `steps`, etc.). Unknown/unroutable places return 404. |
| `/api/options` | `from`, `to` | Returns the fastest route and, when distinct/available, a step-free alternative; otherwise flags accessibility availability. A missing route returns 404. |
| `/api/nearest` | `category`, optional `from`, `open`, `limit` | Returns matching loaded locations (up to `limit`, default 3), optionally with walking distance and minutes from a valid origin. `open` uses the same truthy values as `accessible`. |
| `/api/location` | `id` | Returns the matched location record and computed open status, or 404. `id` can resolve a known name/alias as well as an ID. |
| `/api/search` | `q` | Returns up to eight matching location records. |
| `/api/room` | `code` | Resolves a room code to its configured building/floor information, or 404. |
| `/api/next-class` | optional `from`, `accessible` | Returns `{next_class: ...}` from the JSON demo timetable; includes a route when an origin and mapped class location are available. |
| `/api/emergency` | — | Returns the emergency contacts loaded from `data/emergency.json`. A null phone means no number is supplied; do not infer or invent a contact number. |
| `/api/ask` | `q`, optional `origin` | Runs the Navigator parse/answer pipeline and returns the answer object. The UI primarily uses POST for natural-language questions. |

All other GET paths are treated as static-file requests under `NAV_STATIC_DIR` (defaults to `frontend/navigator-ui`). Path traversal outside that directory is rejected.

### POST endpoints

Send a JSON object with `Content-Type: application/json`.

| Path | Request fields | Behavior |
|---|---|---|
| `/api/ask` | `text` (question), optional `origin` | Runs the Navigator parse/answer pipeline and returns a structured answer including query, parsed intent, reply, and applicable location/route fields. |
| `/api/next-class` | optional `entries`, `from`, `accessible` | Uses provided timetable entries when supplied; otherwise the Navigator's JSON timetable. Returns next class and an optional route. |
| `/api/editor/save` | optional `locations` and `nodes` maps of IDs to `[lat, lng]` | Writes coordinates for known IDs to `data/locations.json` and `data/graph.json`, reloads the in-memory campus data, and returns `{saved: count}`. The editor is enabled unless `NAV_EDITOR=0`; it is unauthenticated and should be used only in a trusted demo. |

The handler also responds to OPTIONS requests for browser CORS preflight.

### Useful response shapes

A route contains at least `origin`, `destination`, `accessible`, `distance_m`, `minutes`, `uses_stairs`, `polyline`, `path`, and `steps`. Each step has a `via`, `to`, `meters`, `stairs`, and `covered` field. Location objects include `id`, `name`, `type`, `category`, `lat`, `lng`, `inside`, `hours`, `verified`, and computed `open` (`status`/`label`). Exact fields depend on the loaded records and applicable route.

The answer endpoint's fields are intent-dependent. For example, a route answer may include `route` and `destination`; a next-class answer may include `next_class`; an emergency answer includes emergency contacts. Treat all content as a demo response backed by the checked-in data, not as a source of verified live campus information.

## Workspace API status

`frontend/workspace-ui/js/api.js` documents client-side calls such as `/api/assignments`, `/api/ai/quick-add`, `/api/myday`, and `/api/timetable`. **No assignments HTTP handler/server is present in this checkout**, so these are client expectations, not available endpoints here. The documented `API_PORT=8766` in `.env.example` is not currently bound by a server. `frontend/workspace-ui/serve.py` is a static-file server and does not proxy API requests.

No Campus Life/community API routes or implementation are present in the current checkout. Do not infer or publish an API contract for them from prior-session notes alone.
